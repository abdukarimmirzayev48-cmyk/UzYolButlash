from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.paths import UPLOADS_DIR
from backend.app.db.session import get_db
from backend.app.api.procurement import ensure_procurement_for_order, sync_procurement_items_from_order
from backend.app.models.client import Client
from backend.app.models.contract import Contract, ContractItem, TransportPaymentType
from backend.app.models.delivery import BatchStatus, DeliveryBatch, DeliveryBatchItem
from backend.app.models.finance import CustomerInvoice, InvoiceStatus
from backend.app.models.procurement import Procurement
from backend.app.models.order import (
    FulfillmentType,
    Order,
    OrderDocument,
    OrderDocumentType,
    OrderItem,
    OrderNote,
    OrderSupplierOption,
    OrderStatus,
    SourceType,
    SupplierStatus,
)
from backend.app.schemas.client import Page
from backend.app.services import order_contract_check
from backend.app.schemas.order import (
    ContractItemBalance,
    OrderCreate,
    OrderContractCheckRead,
    OrderContractLine,
    OrderDetail,
    OrderDocumentCreate,
    OrderDocumentRead,
    OrderDocumentUpdate,
    OrderItemCreate,
    OrderItemRead,
    OrderItemUpdate,
    OrderListItem,
    OrderManualStatusUpdate,
    OrderNoteCreate,
    OrderNoteRead,
    OrderNoteUpdate,
    OrderSummary,
    OrderUpdate,
    SupplierOptionCreate,
    SupplierOptionRead,
    SupplierOptionUpdate,
)
from backend.app.services.order_status import MANUAL_ORDER_STATUSES, sync_order_status
from backend.app.services.contract_status import sync_contract_status
from backend.app.services.auth import require_edit


router = APIRouter(prefix="/api/orders", tags=["orders"])
MONEY = Decimal("0.01")
QTY = Decimal("0.001")
UPLOAD_DIR = UPLOADS_DIR / "orders"


def money(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(QTY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi.")
    return order


def get_child_or_404(db: Session, model: Any, order_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.order_id != order_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi.")
    return item


def load_order_detail(db: Session, order_id: int) -> Order:
    order = db.scalars(
        select(Order)
        .where(Order.id == order_id)
        .options(
            selectinload(Order.client),
            selectinload(Order.contract).selectinload(Contract.items),
            selectinload(Order.items),
            selectinload(Order.procurement).selectinload(Procurement.items),
            selectinload(Order.procurement).selectinload(Procurement.offers),
            selectinload(Order.delivery_batches).selectinload(DeliveryBatch.items),
            selectinload(Order.supplier_options),
            selectinload(Order.documents),
            selectinload(Order.notes_history),
        )
    ).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi.")
    return order


def get_contract_or_400(db: Session, contract_id: int) -> Contract:
    contract = db.scalars(select(Contract).where(Contract.id == contract_id).options(selectinload(Contract.items))).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Shartnoma mavjud emas.")
    return contract


def ensure_contract_in_force(contract) -> None:
    """Refuse to open new work on a contract that is no longer in force.

    One of the expired contracts already had a delivery booked against it,
    which is how this was noticed. Extending the contract -- putting it back to
    active with a reason -- is the way to carry on.
    """
    from backend.app.models.contract import ContractStatus

    if contract.status in {ContractStatus.expired, ContractStatus.cancelled}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Bu shartnoma bo'yicha yangi buyurtma ochib bo'lmaydi: shartnoma amalda emas. "
                "Muddatini uzaytiring yoki yangi shartnoma tuzing."
            ),
        )
    if contract.valid_until and contract.valid_until < date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Shartnoma amal qilish muddati {contract.valid_until} da tugagan. "
                "Yangi buyurtma ochish uchun muddatini uzaytiring."
            ),
        )


def ensure_contract_has_client(contract: Contract) -> None:
    if contract.client_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Bu shartnoma mijozga bog'lanmagan. Avval shartnomani ERP mijozi bilan bog'lang.",
        )


def calculate_item(item: OrderItem) -> None:
    item.subtotal = money(item.quantity * item.unit_price)
    item.vat_amount = money(item.subtotal * item.vat_rate / Decimal("100"))
    item.total_with_vat = money(item.subtotal + item.vat_amount)


MAX_MARKUP_PERCENT = Decimal("999.99")


def apply_defaults(order: Order) -> None:
    if order.fulfillment_type == FulfillmentType.direct_supplier_to_customer:
        order.logistics_price = Decimal("0")
    if order.markup_percent is None:
        order.markup_percent = Decimal("0")
    if order.markup_amount is None:
        order.markup_amount = Decimal("0")
    if order.logistics_price is None:
        order.logistics_price = Decimal("0")


def apply_markup(order: Order, from_percent: bool = False) -> None:
    """The markup is a sum; the stored percent is only its share of the goods.

    from_percent is a one-shot conversion for callers that still speak in
    percent (the older order form, the russia_direct default). Outside that,
    the sum is authoritative -- deriving it from the percent on every save made
    it impossible to clear a markup, because a zero would immediately be
    recomputed from the percent left over from the previous value.
    """
    subtotal = order.product_subtotal or Decimal("0")
    if from_percent:
        order.markup_amount = money(subtotal * (order.markup_percent or Decimal("0")) / Decimal("100"))
    order.markup_amount = money(order.markup_amount or Decimal("0"))
    if subtotal:
        order.markup_percent = min(money(order.markup_amount / subtotal * Decimal("100")), MAX_MARKUP_PERCENT)
    else:
        order.markup_percent = Decimal("0")


def recalculate_order(db: Session, order: Order, markup_from_percent: bool = False) -> None:
    apply_defaults(order)
    for item in order.items:
        calculate_item(item)
    order.product_subtotal = money(sum((item.subtotal for item in order.items), Decimal("0")))
    order.vat_amount = money(sum((item.vat_amount for item in order.items), Decimal("0")))
    apply_markup(order, from_percent=markup_from_percent)
    order.total_amount = money(order.product_subtotal + order.vat_amount + order.markup_amount + order.logistics_price)
    db.flush()


def ordered_quantity_for_contract_item(db: Session, contract_item_id: int, exclude_order_id: int | None = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(OrderItem.quantity), 0)).join(Order).where(
        OrderItem.contract_item_id == contract_item_id,
        Order.status != OrderStatus.cancelled,
    )
    if exclude_order_id:
        stmt = stmt.where(Order.id != exclude_order_id)
    return qty(db.scalar(stmt) or Decimal("0"))


def balance_for_contract_item(db: Session, contract_item: ContractItem, exclude_order_id: int | None = None) -> ContractItemBalance:
    ordered = ordered_quantity_for_contract_item(db, contract_item.id, exclude_order_id)
    remaining = qty(contract_item.quantity - ordered)
    return ContractItemBalance(
        contract_item_id=contract_item.id,
        product_name=contract_item.product_name,
        unit=contract_item.unit,
        unit_price=contract_item.unit_price,
        vat_rate=contract_item.vat_rate,
        contract_quantity=qty(contract_item.quantity),
        ordered_quantity=ordered,
        remaining_quantity=remaining,
    )


def validate_items_against_contract(
    db: Session, contract: Contract, items: list[OrderItemCreate], exclude_order_id: int | None = None
) -> dict[int, ContractItem]:
    contract_items = {item.id: item for item in contract.items}
    requested: dict[int, Decimal] = {}
    for item in items:
        if item.contract_item_id not in contract_items:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Buyurtma mahsuloti tanlangan shartnoma spetsifikatsiyasidan tanlanishi kerak.",
            )
        requested[item.contract_item_id] = requested.get(item.contract_item_id, Decimal("0")) + item.quantity
    for contract_item_id, quantity in requested.items():
        balance = balance_for_contract_item(db, contract_items[contract_item_id], exclude_order_id)
        if quantity > balance.remaining_quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Bu mahsulot bo'yicha shartnoma qoldig'i {balance.remaining_quantity} "
                    f"{balance.unit}. Siz {quantity} {balance.unit} kiritdingiz."
                ),
            )
    return contract_items


def order_item_dependants(db: Session, order_item_id: int) -> list[str]:
    """What would be orphaned if this order line went away.

    delivery_batch_items and procurement_items point at order_items with a NOT
    NULL column, so clearing the collection made SQLAlchemy try to null them and
    the database refused -- the edit came back as a 500 with a constraint error
    instead of an explanation.
    """
    from backend.app.models.delivery import DeliveryBatchItem
    from backend.app.models.procurement import ProcurementItem

    blocking = []
    if db.scalar(select(func.count()).where(DeliveryBatchItem.order_item_id == order_item_id)):
        blocking.append("yetkazib berish partiyalari")
    if db.scalar(select(func.count()).where(ProcurementItem.order_item_id == order_item_id)):
        blocking.append("xarid qatorlari")
    return blocking


def apply_order_items(db: Session, order: Order, contract: Contract, payloads: list) -> None:
    """Update the order's lines in place instead of replacing them.

    Rebuilding the collection from scratch destroyed the identity of every line,
    and anything already pointing at one -- a delivery batch, a procurement --
    lost its target. Matching on contract_item_id keeps those links intact and
    lets a line that really is being removed be refused with a reason.
    """
    contract_items = {item.id: item for item in contract.items}
    existing = {item.contract_item_id: item for item in order.items}
    wanted = {payload.contract_item_id for payload in payloads}

    for contract_item_id, item in list(existing.items()):
        if contract_item_id in wanted:
            continue
        blocking = order_item_dependants(db, item.id)
        if blocking:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"«{item.product_name}» qatorini olib tashlab bo'lmaydi: unga bog'langan "
                    f"{' va '.join(blocking)} mavjud."
                ),
            )
        order.items.remove(item)

    for payload in payloads:
        contract_item = contract_items[payload.contract_item_id]
        item = existing.get(payload.contract_item_id)
        if item is None:
            order.items.append(build_order_item(contract_item, payload))
            continue
        item.product_name = contract_item.product_name
        item.unit = contract_item.unit
        item.quantity = payload.quantity
        item.unit_price = payload.unit_price if payload.unit_price is not None else contract_item.unit_price
        item.vat_rate = payload.vat_rate if payload.vat_rate is not None else contract_item.vat_rate
        calculate_item(item)
    db.flush()


def build_order_item(contract_item: ContractItem, payload: OrderItemCreate, order_id: int | None = None) -> OrderItem:
    item = OrderItem(
        contract_item_id=contract_item.id,
        product_name=contract_item.product_name,
        unit=contract_item.unit,
        quantity=payload.quantity,
        unit_price=payload.unit_price if payload.unit_price is not None else contract_item.unit_price,
        vat_rate=payload.vat_rate if payload.vat_rate is not None else contract_item.vat_rate,
    )
    if order_id is not None:
        item.order_id = order_id
    calculate_item(item)
    return item


def balances_for_order(db: Session, order: Order) -> list[ContractItemBalance]:
    return [balance_for_contract_item(db, item, order.id) for item in order.contract.items]


def paid_amount_for_order(db: Session, order_id: int) -> Decimal:
    paid = db.scalar(
        select(func.coalesce(func.sum(CustomerInvoice.paid_amount), 0)).where(
            CustomerInvoice.order_id == order_id,
            CustomerInvoice.status != InvoiceStatus.cancelled,
        )
    )
    return money(paid or Decimal("0"))


def summary_for(db: Session, order: Order) -> OrderSummary:
    total_quantity = qty(sum((item.quantity for item in order.items), Decimal("0")))
    delivered_quantity = qty(
        sum(
            (
                item.accepted_quantity or Decimal("0")
                for batch in order.delivery_batches
                if batch.status != BatchStatus.cancelled
                for item in batch.items
            ),
            Decimal("0"),
        )
    )
    completed_batches = sum(1 for batch in order.delivery_batches if batch.status in {BatchStatus.completed, BatchStatus.accepted})
    return OrderSummary(
        total_quantity=total_quantity,
        product_subtotal=money(order.product_subtotal),
        vat_amount=money(order.vat_amount),
        markup_percent=money(order.markup_percent),
        markup_amount=money(order.markup_amount),
        logistics_price=money(order.logistics_price),
        total_amount=money(order.total_amount),
        delivered_quantity=delivered_quantity,
        remaining_quantity=qty(total_quantity - delivered_quantity),
        items_count=len(order.items),
        paid_amount=paid_amount_for_order(db, order.id),
        delivery_batches_count=len(order.delivery_batches),
    )


def serialize_list_item(order: Order) -> OrderListItem:
    total_quantity = qty(sum((item.quantity for item in order.items), Decimal("0")))
    delivered_quantity = qty(
        sum(
            (
                item.accepted_quantity or Decimal("0")
                for batch in order.delivery_batches
                if batch.status != BatchStatus.cancelled
                for item in batch.items
            ),
            Decimal("0"),
        )
    )
    return OrderListItem(
        id=order.id,
        client_id=order.client_id,
        contract_id=order.contract_id,
        order_number=order.order_number,
        order_date=order.order_date,
        required_date=order.required_date,
        status=order.status,
        fulfillment_type=order.fulfillment_type,
        source_type=order.source_type,
        supplier_id=order.supplier_id,
        supplier_name=order.supplier_name,
        supplier_status=order.supplier_status,
        supplier_notes=order.supplier_notes,
        currency=order.currency,
        product_subtotal=money(order.product_subtotal),
        vat_amount=money(order.vat_amount),
        markup_percent=money(order.markup_percent),
        markup_amount=money(order.markup_amount),
        logistics_price=money(order.logistics_price),
        total_amount=money(order.total_amount),
        notes=order.notes,
        created_by=order.created_by,
        created_at=order.created_at,
        updated_at=order.updated_at,
        client=order.client,
        contract=order.contract,
        product=order.items[0].product_name if order.items else None,
        total_quantity=total_quantity,
        delivered_quantity=delivered_quantity,
        remaining_quantity=qty(total_quantity - delivered_quantity),
        last_activity=None,
    )


@router.get("/contract/{contract_id}/balances", response_model=list[ContractItemBalance])
def get_contract_balances(contract_id: int, db: Session = Depends(get_db)):
    contract = get_contract_or_400(db, contract_id)
    return [balance_for_contract_item(db, item) for item in contract.items]


@router.get("", response_model=Page[OrderListItem])
def list_orders(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    order_number: str | None = None,
    contract_number: str | None = None,
    client_name: str | None = None,
    inn: str | None = None,
    product_name: str | None = None,
    supplier_name: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: int | None = None,
    contract_id: int | None = None,
    source_type: str | None = None,
    fulfillment_type: str | None = None,
    supplier_status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    delivery: str | None = Query(default=None, description="overdue | soon"),
):
    stmt = (
        select(Order)
        .join(Client)
        .join(Contract)
        .outerjoin(OrderItem)
        .options(
            selectinload(Order.client),
            selectinload(Order.contract),
            selectinload(Order.items),
            selectinload(Order.delivery_batches).selectinload(DeliveryBatch.items),
        )
        .distinct()
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                Order.order_number.ilike(value),
                Contract.contract_number.ilike(value),
                Client.name.ilike(value),
                Client.inn.ilike(value),
                OrderItem.product_name.ilike(value),
                Order.supplier_name.ilike(value),
            )
        )
    if order_number:
        filters.append(Order.order_number.ilike(f"%{order_number}%"))
    if contract_number:
        filters.append(Contract.contract_number.ilike(f"%{contract_number}%"))
    if client_name:
        filters.append(Client.name.ilike(f"%{client_name}%"))
    if inn:
        filters.append(Client.inn.ilike(f"%{inn}%"))
    if product_name:
        filters.append(OrderItem.product_name.ilike(f"%{product_name}%"))
    if supplier_name:
        filters.append(Order.supplier_name.ilike(f"%{supplier_name}%"))
    if delivery:
        # A date question about goods, not a status one: an order can sit in
        # "partially_delivered" for months and its status never says so.
        # Finished orders are excluded whatever the date -- what is delivered is
        # not late any more.
        today = date.today()
        filters.append(Order.required_date.isnot(None))
        filters.append(Order.status.notin_([OrderStatus.delivered, OrderStatus.closed, OrderStatus.cancelled]))
        if delivery == "overdue":
            filters.append(Order.required_date < today)
        elif delivery == "soon":
            filters.append(Order.required_date >= today)
            filters.append(Order.required_date <= today + timedelta(days=7))
    if status_filter:
        filters.append(Order.status == status_filter)
    if client_id:
        filters.append(Order.client_id == client_id)
    if contract_id:
        filters.append(Order.contract_id == contract_id)
    if source_type:
        filters.append(Order.source_type == source_type)
    if fulfillment_type:
        filters.append(Order.fulfillment_type == fulfillment_type)
    if supplier_status:
        filters.append(Order.supplier_status == supplier_status)
    if date_from:
        filters.append(Order.order_date >= date_from)
    if date_to:
        filters.append(Order.order_date <= date_to)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    orders = db.scalars(stmt.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_list_item(order) for order in orders], total=total, page=page, page_size=page_size)


@router.post("", response_model=OrderDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    contract = get_contract_or_400(db, payload.contract_id)
    ensure_contract_has_client(contract)
    ensure_contract_in_force(contract)
    contract_items = validate_items_against_contract(db, contract, payload.items)
    data = payload.model_dump(exclude={"items", "supplier_options", "documents", "initial_note"})
    for protected_field in ("status", "supplier_id", "supplier_name", "supplier_status"):
        data.pop(protected_field, None)
    data["client_id"] = contract.client_id
    order = Order(**data)
    # Default markup for Russian direct supply, applied only when the caller
    # expressed no preference at all -- otherwise an explicit "no markup"
    # would be overwritten on every save.
    # `is None` on purpose: an explicit 0 means "no markup" and must not be
    # overwritten by the default.
    markup_from_percent = payload.markup_amount is None and payload.markup_percent is not None
    if order.source_type == SourceType.russia_direct and payload.markup_amount is None and payload.markup_percent is None:
        order.markup_percent = Decimal("5")
        markup_from_percent = True
    apply_defaults(order)
    db.add(order)
    db.flush()
    for item_payload in payload.items:
        db.add(build_order_item(contract_items[item_payload.contract_item_id], item_payload, order.id))
    for option_payload in payload.supplier_options:
        option = OrderSupplierOption(order_id=order.id, **option_payload.model_dump())
        db.add(option)
        db.flush()
        if option.is_selected:
            select_supplier_option(db, order, option, confirmed=False)
    for document_payload in payload.documents:
        db.add(OrderDocument(order_id=order.id, **document_payload.model_dump()))
    if payload.initial_note:
        db.add(OrderNote(order_id=order.id, **payload.initial_note.model_dump()))
    db.flush()
    db.refresh(order)
    recalculate_order(db, order, markup_from_percent=markup_from_percent)
    if order.source_type != SourceType.supplier_held_stock:
        ensure_procurement_for_order(db, order)
    sync_order_status(order, db=db)
    db.commit()
    return get_order_detail(order.id, db)


def contract_check_for(db: Session, order: Order) -> OrderContractCheckRead:
    """Compare what this order charges with what its contract fixed."""
    contract = order.contract
    transport_terms = contract.transport_terms if contract else None
    transport_separate = (
        transport_terms.transport_payment_type is TransportPaymentType.separate_invoice
        if transport_terms
        else True  # no terms recorded: assume separate rather than accuse
    )
    contract_prices = {item.id: item.unit_price for item in (contract.items if contract else [])}
    check = order_contract_check.build_check(
        items=[
            {
                "product_name": item.product_name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "vat_rate": item.vat_rate,
                "contract_unit_price": contract_prices.get(item.contract_item_id),
            }
            for item in order.items
        ],
        markup_amount=order.markup_amount,
        logistics_price=order.logistics_price,
        charged_total=order.total_amount,
        transport_separate=transport_separate,
    )
    return OrderContractCheckRead(
        contract_goods_amount=check.contract_goods_amount,
        order_goods_amount=check.order_goods_amount,
        goods_difference=check.goods_difference,
        goods_difference_percent=check.goods_difference_percent,
        markup_amount=check.markup_amount,
        logistics_price=check.logistics_price,
        charged_total=check.charged_total,
        contract_supported_total=check.contract_supported_total,
        excess_amount=check.excess_amount,
        excess_percent=check.excess_percent,
        transport_separate=check.transport_separate,
        warnings=check.warnings,
        lines=[OrderContractLine(**line) for line in check.lines],
    )


@router.get("/{order_id}", response_model=OrderDetail)
def get_order_detail(order_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    result = OrderDetail.model_validate(order)
    # Two different questions, and they had been answered with one number.
    #
    # The row on the card is labelled "Shartnoma qoldig'i", so it means what is
    # left on the contract -- this order included. The edit form needs the
    # opposite: the ceiling this order may be raised to, which is the remainder
    # with this order's own quantity given back.
    #
    # balances_for_order() answers the second question (it passes the order id
    # as exclude_order_id). The card was fed that answer and then had the
    # order's quantity added on top, which counted it twice and produced a
    # "remaining" larger than the contract itself: 1 000 t contracted, 120 t
    # ordered, 1 120 t shown as left.
    contract_balances = {item.id: balance_for_contract_item(db, item) for item in order.contract.items}
    items = [
        item.model_copy(update={"balance": contract_balances.get(item.contract_item_id)})
        for item in result.items
    ]
    return result.model_copy(
        update={
            "items": items,
            "summary": summary_for(db, order),
            "contract_item_balances": balances_for_order(db, order),
            "contract_check": contract_check_for(db, order),
        }
    )


@router.patch("/{order_id}", response_model=OrderDetail, dependencies=[Depends(require_edit("sotuv"))])
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    contract = get_contract_or_400(db, payload.contract_id or order.contract_id)
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Buyurtmada kamida bitta mahsulot bo'lishi kerak.")
        validate_items_against_contract(db, contract, payload.items, exclude_order_id=order.id)
    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    # Only convert when the caller sent a percent and no sum -- the older order
    # form still speaks in percent.
    markup_from_percent = "markup_amount" not in data and data.get("markup_percent") is not None
    for protected_field in ("status", "supplier_id", "supplier_name", "supplier_status"):
        data.pop(protected_field, None)
    if "contract_id" in data:
        ensure_contract_has_client(contract)
        data["client_id"] = contract.client_id
    update_model(order, data)
    if payload.items is not None:
        apply_order_items(db, order, contract, payload.items)
    recalculate_order(db, order, markup_from_percent=markup_from_percent)
    if order.source_type != SourceType.supplier_held_stock:
        ensure_procurement_for_order(db, order)
        sync_procurement_items_from_order(db, order.procurement)
    sync_order_status(order, db=db)
    db.commit()
    return get_order_detail(order.id, db)


@router.patch("/{order_id}/status", response_model=OrderDetail, dependencies=[Depends(require_edit("sotuv"))])
def update_order_status(order_id: int, payload: OrderManualStatusUpdate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    if payload.status in MANUAL_ORDER_STATUSES:
        order.status = payload.status
        sync_contract_status(db, order.contract_id)
    elif payload.status == OrderStatus.created:
        sync_order_status(order, db=db, force=True)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Faqat on_hold, cancelled yoki created(avtomatik) statuslarini qo'lda o'rnatish mumkin.",
        )
    db.commit()
    return get_order_detail(order.id, db)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    if db.scalar(select(func.count()).where(DeliveryBatch.order_id == order_id)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yetkazib berish partiyalari mavjud buyurtmani o'chirib bo'lmaydi. Avval ularni olib tashlang.",
        )
    if db.scalar(select(func.count()).where(CustomerInvoice.order_id == order_id)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mijoz hisob-fakturalari mavjud buyurtmani o'chirib bo'lmaydi. Avval ularni olib tashlang.",
        )
    contract_id = order.contract_id
    db.delete(order)
    db.flush()
    sync_contract_status(db, contract_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{order_id}/items", response_model=OrderItemRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_item(order_id: int, payload: OrderItemCreate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    contract_items = validate_items_against_contract(db, order.contract, [payload], exclude_order_id=order.id)
    item = build_order_item(contract_items[payload.contract_item_id], payload, order.id)
    db.add(item)
    db.flush()
    db.refresh(order)
    recalculate_order(db, order)
    if order.source_type != SourceType.supplier_held_stock:
        ensure_procurement_for_order(db, order)
        sync_procurement_items_from_order(db, order.procurement)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{order_id}/items/{item_id}", response_model=OrderItemRead, dependencies=[Depends(require_edit("sotuv"))])
def update_item(order_id: int, item_id: int, payload: OrderItemUpdate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    item = get_child_or_404(db, OrderItem, order_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    merged = OrderItemCreate(
        contract_item_id=data.get("contract_item_id", item.contract_item_id),
        quantity=data.get("quantity", item.quantity),
        unit_price=data.get("unit_price", item.unit_price),
        vat_rate=data.get("vat_rate", item.vat_rate),
    )
    validate_items_against_contract(db, order.contract, [merged], exclude_order_id=order.id)
    contract_item = db.get(ContractItem, merged.contract_item_id)
    item.contract_item_id = merged.contract_item_id
    item.product_name = contract_item.product_name
    item.unit = contract_item.unit
    item.quantity = merged.quantity
    item.unit_price = merged.unit_price if merged.unit_price is not None else contract_item.unit_price
    item.vat_rate = merged.vat_rate if merged.vat_rate is not None else contract_item.vat_rate
    calculate_item(item)
    recalculate_order(db, order)
    if order.source_type != SourceType.supplier_held_stock:
        ensure_procurement_for_order(db, order)
        sync_procurement_items_from_order(db, order.procurement)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{order_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_item(order_id: int, item_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    if len(order.items) <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Buyurtmada kamida bitta mahsulot bo'lishi kerak.")
    item = get_child_or_404(db, OrderItem, order_id, item_id)
    db.delete(item)
    db.flush()
    db.refresh(order)
    recalculate_order(db, order)
    if order.source_type != SourceType.supplier_held_stock:
        ensure_procurement_for_order(db, order)
        sync_procurement_items_from_order(db, order.procurement)
    sync_order_status(order, db=db)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def select_supplier_option(db: Session, order: Order, option: OrderSupplierOption, confirmed: bool) -> None:
    db.query(OrderSupplierOption).filter(
        OrderSupplierOption.order_id == order.id, OrderSupplierOption.id != option.id
    ).update({OrderSupplierOption.is_selected: False}, synchronize_session=False)
    option.is_selected = True
    order.supplier_id = option.supplier_id
    order.supplier_name = option.supplier_name
    order.supplier_status = SupplierStatus.confirmed if confirmed else SupplierStatus.selected


@router.post("/{order_id}/supplier-options", response_model=SupplierOptionRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_supplier_option(order_id: int, payload: SupplierOptionCreate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    option = OrderSupplierOption(order_id=order_id, **payload.model_dump())
    db.add(option)
    db.flush()
    if option.is_selected:
        select_supplier_option(db, order, option, confirmed=False)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(option)
    return option


@router.patch("/{order_id}/supplier-options/{option_id}", response_model=SupplierOptionRead, dependencies=[Depends(require_edit("sotuv"))])
def update_supplier_option(order_id: int, option_id: int, payload: SupplierOptionUpdate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    option = get_child_or_404(db, OrderSupplierOption, order_id, option_id)
    update_model(option, payload.model_dump(exclude_unset=True))
    if option.is_selected:
        select_supplier_option(db, order, option, confirmed=False)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(option)
    return option


@router.post("/{order_id}/supplier-options/{option_id}/select", response_model=SupplierOptionRead, dependencies=[Depends(require_edit("sotuv"))])
def select_supplier(order_id: int, option_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    option = get_child_or_404(db, OrderSupplierOption, order_id, option_id)
    select_supplier_option(db, order, option, confirmed=False)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(option)
    return option


@router.post("/{order_id}/supplier-options/{option_id}/confirm", response_model=SupplierOptionRead, dependencies=[Depends(require_edit("sotuv"))])
def confirm_supplier(order_id: int, option_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    option = get_child_or_404(db, OrderSupplierOption, order_id, option_id)
    select_supplier_option(db, order, option, confirmed=True)
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(option)
    return option


@router.delete("/{order_id}/supplier-options/{option_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_supplier_option(order_id: int, option_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    option = get_child_or_404(db, OrderSupplierOption, order_id, option_id)
    was_selected = option.is_selected
    if option in order.supplier_options:
        order.supplier_options.remove(option)
    db.delete(option)
    db.flush()
    if was_selected:
        order.supplier_id = None
        order.supplier_name = None
        order.supplier_status = SupplierStatus.not_selected
    sync_order_status(order, db=db)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{order_id}/documents", response_model=OrderDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_document(order_id: int, payload: OrderDocumentCreate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    document = OrderDocument(order_id=order_id, **payload.model_dump())
    db.add(document)
    db.flush()
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(document)
    return document


@router.post("/{order_id}/documents/upload", response_model=OrderDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def upload_document(
    order_id: int,
    document_type: OrderDocumentType = Form(...),
    title: str = Form(...),
    uploaded_by: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fayl majburiy.")
    order = load_order_detail(db, order_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    with destination.open("wb") as buffer:
        copyfileobj(file.file, buffer)
    document = OrderDocument(
        order_id=order_id,
        document_type=document_type,
        title=title,
        file_url=f"/static/uploads/orders/{stored_name}",
        uploaded_by=uploaded_by,
    )
    db.add(document)
    db.flush()
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{order_id}/documents/{document_id}", response_model=OrderDocumentRead, dependencies=[Depends(require_edit("sotuv"))])
def update_document(order_id: int, document_id: int, payload: OrderDocumentUpdate, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    document = get_child_or_404(db, OrderDocument, order_id, document_id)
    update_model(document, payload.model_dump(exclude_unset=True))
    db.flush()
    sync_order_status(order, db=db)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{order_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_document(order_id: int, document_id: int, db: Session = Depends(get_db)):
    order = load_order_detail(db, order_id)
    document = get_child_or_404(db, OrderDocument, order_id, document_id)
    db.delete(document)
    db.flush()
    sync_order_status(order, db=db)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{order_id}/notes", response_model=OrderNoteRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_note(order_id: int, payload: OrderNoteCreate, db: Session = Depends(get_db)):
    get_order_or_404(db, order_id)
    note = OrderNote(order_id=order_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{order_id}/notes/{note_id}", response_model=OrderNoteRead, dependencies=[Depends(require_edit("sotuv"))])
def update_note(order_id: int, note_id: int, payload: OrderNoteUpdate, db: Session = Depends(get_db)):
    note = get_child_or_404(db, OrderNote, order_id, note_id)
    update_model(note, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{order_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_note(order_id: int, note_id: int, db: Session = Depends(get_db)):
    note = get_child_or_404(db, OrderNote, order_id, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
