from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.delivery import DeliveryBatch, Logistics
from backend.app.models.inventory import (
    ExchangeTicket,
    ExchangeTicketStatus,
    StockAllocation,
    StockAllocationStatus,
    StockLocation,
    StockLocationType,
    StockLot,
    StockMovement,
    StockMovementType,
    StockStatus,
)
from backend.app.models.order import Order, OrderItem, SourceType, SupplierStatus
from backend.app.models.procurement import Supplier, SupplierAddress, SupplierAddressType
from backend.app.schemas.client import Page
from backend.app.schemas.inventory import (
    ExchangeTicketCreate,
    ExchangeTicketRead,
    ExchangeTicketUpdate,
    StockAllocationCreate,
    StockAllocationRead,
    StockLotDetail,
    StockLotSummary,
    StockMovementRead,
)
from backend.app.services.auth import require_edit
from backend.app.services.order_status import sync_order_status


router = APIRouter(prefix="/api", tags=["inventory"])
MONEY = Decimal("0.01")
QTY = Decimal("0.001")


def money(value: Decimal | int | float | None) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal | int | float | None) -> Decimal:
    return Decimal(value or 0).quantize(QTY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def recalculate_ticket(ticket: ExchangeTicket) -> None:
    ticket.quantity = qty(ticket.quantity)
    ticket.unit_price = money(ticket.unit_price)
    ticket.vat_rate = money(ticket.vat_rate if ticket.vat_rate is not None else Decimal("12"))
    ticket.payment_term_days = ticket.payment_term_days if ticket.payment_term_days is not None else 90
    ticket.subtotal_amount = money(ticket.quantity * ticket.unit_price)
    ticket.vat_amount = money(ticket.subtotal_amount * ticket.vat_rate / Decimal("100"))
    ticket.total_amount = money(ticket.subtotal_amount + ticket.vat_amount)
    ticket.due_date = ticket.ticket_date + timedelta(days=ticket.payment_term_days)


def supplier_storage_address(db: Session, supplier_id: int) -> tuple[str | None, str | None, str | None]:
    rows = db.scalars(select(SupplierAddress).where(SupplierAddress.supplier_id == supplier_id)).all()
    for address_type in (SupplierAddressType.loading, SupplierAddressType.warehouse, SupplierAddressType.factory, SupplierAddressType.legal):
        address = next((row for row in rows if row.address_type == address_type and row.address), None)
        if address:
            return address.address, address.region, address.district
    address = next((row for row in rows if row.address), None)
    return (address.address, address.region, address.district) if address else (None, None, None)


def ensure_supplier_stock_location(db: Session, supplier: Supplier) -> StockLocation:
    location = db.scalars(
        select(StockLocation).where(
            StockLocation.supplier_id == supplier.id,
            StockLocation.location_type == StockLocationType.supplier_storage,
        )
    ).first()
    if location:
        return location
    address, region, district = supplier_storage_address(db, supplier.id)
    location = StockLocation(
        location_type=StockLocationType.supplier_storage,
        supplier_id=supplier.id,
        name=f"{supplier.name} ombori",
        address=address,
        region=region,
        district=district,
    )
    db.add(location)
    db.flush()
    return location


def add_stock_movement(
    db: Session,
    stock_lot: StockLot,
    movement_type: StockMovementType,
    quantity: Decimal,
    *,
    order_id: int | None = None,
    delivery_batch_id: int | None = None,
    from_location_id: int | None = None,
    to_location_id: int | None = None,
    notes: str | None = None,
    created_by: str | None = "system",
) -> StockMovement:
    movement = StockMovement(
        stock_lot_id=stock_lot.id,
        movement_type=movement_type,
        quantity=qty(quantity),
        from_location_id=from_location_id,
        to_location_id=to_location_id,
        order_id=order_id,
        delivery_batch_id=delivery_batch_id,
        notes=notes,
        created_by=created_by,
    )
    db.add(movement)
    return movement


def update_stock_status(lot: StockLot) -> None:
    if lot.quantity_available <= 0 and lot.quantity_reserved <= 0:
        lot.stock_status = StockStatus.used
    elif lot.quantity_reserved > 0 and lot.quantity_available > 0:
        lot.stock_status = StockStatus.partially_used
    elif lot.quantity_reserved > 0:
        lot.stock_status = StockStatus.reserved
    else:
        lot.stock_status = StockStatus.available


def ensure_stock_lot_for_ticket(db: Session, ticket: ExchangeTicket) -> StockLot:
    existing = db.scalars(select(StockLot).where(StockLot.ticket_id == ticket.id)).first()
    if existing:
        return existing
    supplier = db.get(Supplier, ticket.supplier_id)
    if not supplier:
        raise HTTPException(status_code=422, detail="Ta'minotchi topilmadi.")
    location = ensure_supplier_stock_location(db, supplier)
    lot = StockLot(
        ticket_id=ticket.id,
        supplier_id=supplier.id,
        stock_location_id=location.id,
        product_id=ticket.product_id,
        product_name=ticket.product_name,
        unit=ticket.unit,
        quantity_initial=qty(ticket.quantity),
        quantity_available=qty(ticket.quantity),
        quantity_reserved=Decimal("0"),
        unit_cost=money(ticket.unit_price),
        currency="UZS",
        stock_status=StockStatus.available,
    )
    db.add(lot)
    db.flush()
    add_stock_movement(
        db,
        lot,
        StockMovementType.purchase_in,
        lot.quantity_initial,
        to_location_id=location.id,
        notes=f"Birja ticketi: {ticket.ticket_number}",
        created_by=ticket.created_by or "system",
    )
    return lot


def stock_lot_summary(lot: StockLot) -> StockLotSummary:
    ticket = lot.ticket
    location = lot.stock_location
    return StockLotSummary(
        id=lot.id,
        ticket_id=lot.ticket_id,
        ticket_number=ticket.ticket_number if ticket else None,
        supplier_id=lot.supplier_id,
        supplier_name=lot.supplier.name if lot.supplier else None,
        stock_location_id=lot.stock_location_id,
        location_name=location.name if location else None,
        location_address=location.address if location else None,
        product_id=lot.product_id,
        product_name=lot.product_name,
        unit=lot.unit,
        quantity_initial=qty(lot.quantity_initial),
        quantity_available=qty(lot.quantity_available),
        quantity_reserved=qty(lot.quantity_reserved),
        unit_cost=money(lot.unit_cost),
        currency=lot.currency,
        ownership_status=lot.ownership_status,
        stock_status=lot.stock_status,
        due_date=ticket.due_date if ticket else None,
        created_at=lot.created_at,
        updated_at=lot.updated_at,
    )


def ticket_read(ticket: ExchangeTicket) -> ExchangeTicketRead:
    stock_lot = stock_lot_summary(ticket.stock_lot) if ticket.stock_lot else None
    return ExchangeTicketRead(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        ticket_date=ticket.ticket_date,
        supplier_id=ticket.supplier_id,
        supplier_name=ticket.supplier_name,
        product_id=ticket.product_id,
        product_name=ticket.product_name,
        unit=ticket.unit,
        quantity=qty(ticket.quantity),
        unit_price=money(ticket.unit_price),
        subtotal_amount=money(ticket.subtotal_amount),
        vat_rate=money(ticket.vat_rate),
        vat_amount=money(ticket.vat_amount),
        total_amount=money(ticket.total_amount),
        payment_term_days=ticket.payment_term_days,
        due_date=ticket.due_date,
        status=ticket.status,
        notes=ticket.notes,
        created_by=ticket.created_by,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        stock_lot=stock_lot,
    )


@router.get("/exchange-tickets", response_model=Page[ExchangeTicketRead])
def list_exchange_tickets(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    supplier_id: int | None = None,
    product_name: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    due_from: date | None = None,
    due_to: date | None = None,
    overdue_only: bool = False,
):
    stmt = select(ExchangeTicket).options(
        selectinload(ExchangeTicket.supplier),
        selectinload(ExchangeTicket.stock_lot).selectinload(StockLot.supplier),
        selectinload(ExchangeTicket.stock_lot).selectinload(StockLot.stock_location),
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(ExchangeTicket.ticket_number.ilike(value), ExchangeTicket.supplier_name.ilike(value), ExchangeTicket.product_name.ilike(value)))
    if supplier_id:
        filters.append(ExchangeTicket.supplier_id == supplier_id)
    if product_name:
        filters.append(ExchangeTicket.product_name.ilike(f"%{product_name}%"))
    if status_filter:
        filters.append(ExchangeTicket.status == status_filter)
    if due_from:
        filters.append(ExchangeTicket.due_date >= due_from)
    if due_to:
        filters.append(ExchangeTicket.due_date <= due_to)
    if overdue_only:
        filters.append(ExchangeTicket.due_date < date.today())
        filters.append(ExchangeTicket.status.notin_([ExchangeTicketStatus.paid, ExchangeTicketStatus.closed, ExchangeTicketStatus.cancelled]))
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    tickets = db.scalars(stmt.order_by(ExchangeTicket.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[ticket_read(ticket) for ticket in tickets], total=total, page=page, page_size=page_size)


@router.post("/exchange-tickets", response_model=ExchangeTicketRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_exchange_ticket(payload: ExchangeTicketCreate, db: Session = Depends(get_db)):
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=422, detail="Ta'minotchi topilmadi.")
    if db.scalar(select(ExchangeTicket.id).where(ExchangeTicket.ticket_number == payload.ticket_number)):
        raise HTTPException(status_code=422, detail="Bu ticket raqami avval kiritilgan.")
    ticket = ExchangeTicket(
        **payload.model_dump(exclude={"open_immediately"}),
        supplier_name=supplier.name,
        status=ExchangeTicketStatus.opened if payload.open_immediately else ExchangeTicketStatus.draft,
    )
    recalculate_ticket(ticket)
    db.add(ticket)
    db.flush()
    if ticket.status == ExchangeTicketStatus.opened:
        ensure_stock_lot_for_ticket(db, ticket)
    db.commit()
    return get_exchange_ticket(ticket.id, db)


@router.get("/exchange-tickets/{ticket_id}", response_model=ExchangeTicketRead)
def get_exchange_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.scalars(
        select(ExchangeTicket)
        .where(ExchangeTicket.id == ticket_id)
        .options(
            selectinload(ExchangeTicket.supplier),
            selectinload(ExchangeTicket.stock_lot).selectinload(StockLot.supplier),
            selectinload(ExchangeTicket.stock_lot).selectinload(StockLot.stock_location),
        )
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket topilmadi.")
    return ticket_read(ticket)


@router.patch("/exchange-tickets/{ticket_id}", response_model=ExchangeTicketRead, dependencies=[Depends(require_edit("taminot"))])
def update_exchange_ticket(ticket_id: int, payload: ExchangeTicketUpdate, db: Session = Depends(get_db)):
    ticket = db.get(ExchangeTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket topilmadi.")
    if ticket.stock_lot and any(value is not None for value in (payload.quantity, payload.unit_price, payload.product_name, payload.unit)):
        raise HTTPException(status_code=422, detail="Zaxira yaratilgan ticket mahsulot ma'lumotlarini tahrirlab bo'lmaydi.")
    data = payload.model_dump(exclude_unset=True)
    if "supplier_id" in data:
        supplier = db.get(Supplier, data["supplier_id"])
        if not supplier:
            raise HTTPException(status_code=422, detail="Ta'minotchi topilmadi.")
        data["supplier_name"] = supplier.name
    update_model(ticket, data)
    recalculate_ticket(ticket)
    if ticket.status == ExchangeTicketStatus.opened:
        ensure_stock_lot_for_ticket(db, ticket)
    db.commit()
    return get_exchange_ticket(ticket.id, db)


@router.post("/exchange-tickets/{ticket_id}/open", response_model=ExchangeTicketRead, dependencies=[Depends(require_edit("taminot"))])
def open_exchange_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.get(ExchangeTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket topilmadi.")
    if ticket.status == ExchangeTicketStatus.cancelled:
        raise HTTPException(status_code=422, detail="Bekor qilingan ticketni ochib bo'lmaydi.")
    ticket.status = ExchangeTicketStatus.opened
    recalculate_ticket(ticket)
    ensure_stock_lot_for_ticket(db, ticket)
    db.commit()
    return get_exchange_ticket(ticket.id, db)


@router.get("/stock-lots", response_model=Page[StockLotSummary])
def list_stock_lots(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    supplier_id: int | None = None,
    product_name: str | None = None,
    ticket_id: int | None = None,
    location_type: str | None = None,
    available_only: bool = False,
    reserved_only: bool = False,
    due_soon: bool = False,
):
    stmt = (
        select(StockLot)
        .join(ExchangeTicket)
        .options(selectinload(StockLot.ticket), selectinload(StockLot.supplier), selectinload(StockLot.stock_location))
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(StockLot.product_name.ilike(value), ExchangeTicket.ticket_number.ilike(value), StockLot.supplier.has(Supplier.name.ilike(value))))
    if supplier_id:
        filters.append(StockLot.supplier_id == supplier_id)
    if product_name:
        filters.append(StockLot.product_name.ilike(f"%{product_name}%"))
    if ticket_id:
        filters.append(StockLot.ticket_id == ticket_id)
    if location_type:
        filters.append(StockLot.stock_location.has(StockLocation.location_type == location_type))
    if available_only:
        filters.append(StockLot.quantity_available > 0)
    if reserved_only:
        filters.append(StockLot.quantity_reserved > 0)
    if due_soon:
        filters.append(ExchangeTicket.due_date <= date.today() + timedelta(days=7))
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    lots = db.scalars(stmt.order_by(StockLot.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[stock_lot_summary(lot) for lot in lots], total=total, page=page, page_size=page_size)


@router.get("/stock-lots/{lot_id}", response_model=StockLotDetail)
def get_stock_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.scalars(
        select(StockLot)
        .where(StockLot.id == lot_id)
        .options(
            selectinload(StockLot.ticket),
            selectinload(StockLot.supplier),
            selectinload(StockLot.stock_location),
            selectinload(StockLot.allocations),
            selectinload(StockLot.movements),
        )
    ).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Zaxira partiyasi topilmadi.")
    return StockLotDetail(**stock_lot_summary(lot).model_dump(), allocations=lot.allocations, movements=lot.movements)


@router.post("/stock-allocations", response_model=StockAllocationRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_stock_allocation(payload: StockAllocationCreate, db: Session = Depends(get_db)):
    allocation = reserve_stock_for_order(
        db,
        payload.stock_lot_id,
        payload.order_id,
        payload.allocated_quantity,
        order_item_id=payload.order_item_id,
        delivery_batch_id=payload.delivery_batch_id,
        created_by=payload.created_by,
    )
    db.commit()
    db.refresh(allocation)
    return allocation


@router.get("/stock-allocations", response_model=list[StockAllocationRead])
def list_stock_allocations(
    db: Session = Depends(get_db),
    order_id: int | None = None,
    delivery_batch_id: int | None = None,
    stock_lot_id: int | None = None,
):
    stmt = select(StockAllocation).order_by(StockAllocation.created_at.desc())
    if order_id:
        stmt = stmt.where(StockAllocation.order_id == order_id)
    if delivery_batch_id:
        stmt = stmt.where(StockAllocation.delivery_batch_id == delivery_batch_id)
    if stock_lot_id:
        stmt = stmt.where(StockAllocation.stock_lot_id == stock_lot_id)
    return list(db.scalars(stmt).all())


def reserve_stock_for_order(
    db: Session,
    stock_lot_id: int,
    order_id: int,
    allocated_quantity: Decimal,
    *,
    order_item_id: int | None = None,
    delivery_batch_id: int | None = None,
    created_by: str | None = "system",
) -> StockAllocation:
    lot = db.scalars(
        select(StockLot).where(StockLot.id == stock_lot_id).options(selectinload(StockLot.supplier), selectinload(StockLot.stock_location))
    ).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Zaxira partiyasi topilmadi.")
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi.")
    amount = qty(allocated_quantity)
    if amount <= 0:
        raise HTTPException(status_code=422, detail="Ajratiladigan miqdor 0 dan katta bo'lishi kerak.")
    if amount > lot.quantity_available:
        raise HTTPException(status_code=422, detail="Mavjud zaxira yetarli emas.")
    order_item = db.get(OrderItem, order_item_id) if order_item_id else None
    if order_item_id and (not order_item or order_item.order_id != order_id):
        raise HTTPException(status_code=422, detail="Buyurtma mahsuloti ushbu buyurtmaga tegishli emas.")
    if order_item and (
        lot.product_name.strip().lower() != order_item.product_name.strip().lower()
        or lot.unit.strip().lower() != order_item.unit.strip().lower()
    ):
        raise HTTPException(
            status_code=422,
            detail="Zaxira mahsuloti yoki birligi buyurtma mahsulotiga mos emas.",
        )
    lot.quantity_available = qty(lot.quantity_available - amount)
    lot.quantity_reserved = qty(lot.quantity_reserved + amount)
    update_stock_status(lot)
    order.source_type = SourceType.supplier_held_stock
    order.supplier_id = lot.supplier_id
    order.supplier_name = lot.supplier.name if lot.supplier else order.supplier_name
    order.supplier_status = SupplierStatus.confirmed
    allocation = StockAllocation(
        stock_lot_id=lot.id,
        order_id=order_id,
        order_item_id=order_item_id,
        delivery_batch_id=delivery_batch_id,
        allocated_quantity=amount,
        status=StockAllocationStatus.reserved,
    )
    db.add(allocation)
    add_stock_movement(
        db,
        lot,
        StockMovementType.reserve,
        amount,
        order_id=order_id,
        delivery_batch_id=delivery_batch_id,
        from_location_id=lot.stock_location_id,
        notes=f"Buyurtma uchun zaxiradan ajratildi",
        created_by=created_by,
    )
    sync_order_status(order, db=db)
    db.flush()
    return allocation


def link_stock_allocation_to_batch(db: Session, batch: DeliveryBatch) -> None:
    if batch.source_type != SourceType.supplier_held_stock.value:
        return
    existing = db.scalars(select(StockAllocation).where(StockAllocation.delivery_batch_id == batch.id)).first()
    if existing:
        return
    for item in batch.items:
        allocation = db.scalars(
            select(StockAllocation)
            .where(
                StockAllocation.order_id == batch.order_id,
                StockAllocation.order_item_id == item.order_item_id,
                StockAllocation.delivery_batch_id.is_(None),
                StockAllocation.status == StockAllocationStatus.reserved,
                StockAllocation.allocated_quantity >= item.planned_quantity,
            )
            .order_by(StockAllocation.created_at.asc())
        ).first()
        if allocation:
            allocation.delivery_batch_id = batch.id
            lot = allocation.stock_lot
            if lot and lot.supplier:
                batch.supplier_id = lot.supplier_id
                batch.supplier_name = lot.supplier.name
            if batch.logistics and lot and lot.stock_location:
                batch.logistics.loading_address = lot.stock_location.address


def mark_stock_picked_up_for_batch(db: Session, batch: DeliveryBatch) -> None:
    allocations = db.scalars(
        select(StockAllocation).where(
            StockAllocation.delivery_batch_id == batch.id,
            StockAllocation.status == StockAllocationStatus.reserved,
        ).options(selectinload(StockAllocation.stock_lot))
    ).all()
    for allocation in allocations:
        lot = allocation.stock_lot
        amount = qty(allocation.allocated_quantity)
        lot.quantity_reserved = qty(max(Decimal("0"), lot.quantity_reserved - amount))
        update_stock_status(lot)
        allocation.status = StockAllocationStatus.picked_up
        add_stock_movement(
            db,
            lot,
            StockMovementType.pickup,
            amount,
            order_id=allocation.order_id,
            delivery_batch_id=batch.id,
            from_location_id=lot.stock_location_id,
            notes="Partiya yuklandi",
        )


def mark_stock_delivered_for_batch(db: Session, batch: DeliveryBatch) -> None:
    allocations = db.scalars(
        select(StockAllocation).where(
            StockAllocation.delivery_batch_id == batch.id,
            StockAllocation.status.in_([StockAllocationStatus.reserved, StockAllocationStatus.picked_up]),
        ).options(selectinload(StockAllocation.stock_lot))
    ).all()
    for allocation in allocations:
        lot = allocation.stock_lot
        amount = qty(allocation.allocated_quantity)
        if allocation.status == StockAllocationStatus.reserved:
            lot.quantity_reserved = qty(max(Decimal("0"), lot.quantity_reserved - amount))
        update_stock_status(lot)
        allocation.status = StockAllocationStatus.delivered
        add_stock_movement(
            db,
            lot,
            StockMovementType.delivered,
            amount,
            order_id=allocation.order_id,
            delivery_batch_id=batch.id,
            from_location_id=lot.stock_location_id,
            notes="Partiya yetkazildi",
        )
