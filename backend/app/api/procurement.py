from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.contract import Contract
from backend.app.models.order import Order, OrderItem, OrderStatus, SupplierStatus
from backend.app.models.procurement import (
    Procurement,
    ProcurementItem,
    ProcurementStatus,
    Supplier,
    SupplierAddress,
    SupplierBankAccount,
    SupplierContact,
    SupplierDocument,
    SupplierNote,
    SupplierOffer,
    SupplierOfferItem,
    SupplierOfferStatus,
    ProcurementDocument,
    ProcurementNote,
)
from backend.app.services.order_status import sync_order_status
from backend.app.schemas.client import Page
from backend.app.schemas.procurement import (
    ProcurementCreate,
    ProcurementDocumentCreate,
    ProcurementDocumentRead,
    ProcurementDocumentUpdate,
    ProcurementDetail,
    ProcurementListItem,
    ProcurementNoteCreate,
    ProcurementNoteRead,
    ProcurementNoteUpdate,
    ProcurementRead,
    ProcurementSummary,
    SupplierAddressBase,
    SupplierAddressRead,
    SupplierAddressUpdate,
    SupplierBankAccountBase,
    SupplierBankAccountRead,
    SupplierBankAccountUpdate,
    SupplierContactBase,
    SupplierContactRead,
    SupplierContactUpdate,
    SupplierCreate,
    SupplierDetail,
    SupplierDocumentCreate,
    SupplierDocumentRead,
    SupplierDocumentUpdate,
    SupplierListItem,
    SupplierNoteCreate,
    SupplierNoteRead,
    SupplierNoteUpdate,
    SupplierOfferCreate,
    SupplierOfferItemRead,
    SupplierOfferRead,
    SupplierRead,
    SupplierUpdate,
)


supplier_router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])
procurement_router = APIRouter(prefix="/api/procurements", tags=["procurements"])
MONEY = Decimal("0.01")
QTY = Decimal("0.001")


def money(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(QTY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_supplier_or_404(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def get_supplier_child_or_404(db: Session, model: Any, supplier_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.supplier_id != supplier_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


def get_procurement_child_or_404(db: Session, model: Any, procurement_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.procurement_id != procurement_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


def load_supplier_detail(db: Session, supplier_id: int) -> Supplier:
    supplier = db.scalars(
        select(Supplier)
        .where(Supplier.id == supplier_id)
        .options(
            selectinload(Supplier.contacts),
            selectinload(Supplier.addresses),
            selectinload(Supplier.bank_accounts),
            selectinload(Supplier.documents),
            selectinload(Supplier.notes_history),
        )
    ).first()
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def load_procurement_detail(db: Session, procurement_id: int) -> Procurement:
    procurement = db.scalars(
        select(Procurement)
        .where(Procurement.id == procurement_id)
        .options(
            selectinload(Procurement.client),
            selectinload(Procurement.contract),
            selectinload(Procurement.order).selectinload(Order.items),
            selectinload(Procurement.items).selectinload(ProcurementItem.offer_items),
            selectinload(Procurement.offers).selectinload(SupplierOffer.items),
            selectinload(Procurement.offers).selectinload(SupplierOffer.supplier),
            selectinload(Procurement.documents),
            selectinload(Procurement.notes_history),
        )
    ).first()
    if not procurement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procurement not found")
    return procurement


def procurement_summary(procurement: Procurement) -> ProcurementSummary:
    required = qty(sum((item.required_quantity for item in procurement.items), Decimal("0")))
    selected = qty(sum((item.purchased_quantity for item in procurement.items), Decimal("0")))
    selected_suppliers = {
        offer.supplier_id or offer.supplier_name
        for offer in procurement.offers
        for item in offer.items
        if item.selected_quantity and item.selected_quantity > 0
    }
    return ProcurementSummary(
        required_quantity=required,
        selected_quantity=selected,
        remaining_quantity=qty(required - selected),
        offers_count=len(procurement.offers),
        selected_suppliers_count=len(selected_suppliers),
        final_purchase_amount=money(procurement.final_purchase_amount),
    )


def serialize_supplier_list_item(supplier: Supplier) -> SupplierListItem:
    primary_contact = next((item for item in supplier.contacts if item.is_primary), supplier.contacts[0] if supplier.contacts else None)
    loading_address = next((item for item in supplier.addresses if item.address_type.value == "loading"), supplier.addresses[0] if supplier.addresses else None)
    return SupplierListItem(
        **SupplierRead.model_validate(supplier).model_dump(),
        primary_contact=primary_contact,
        primary_region=loading_address.region if loading_address else None,
        primary_loading_address=loading_address.address if loading_address else None,
        last_activity=supplier.updated_at,
    )


def serialize_procurement_list_item(procurement: Procurement) -> ProcurementListItem:
    summary = procurement_summary(procurement)
    return ProcurementListItem(
        **ProcurementRead.model_validate(procurement).model_dump(),
        client=procurement.client,
        contract=procurement.contract,
        order=procurement.order,
        product=procurement.items[0].product_name if procurement.items else None,
        required_quantity=summary.required_quantity,
        selected_quantity=summary.selected_quantity,
        selected_suppliers_count=summary.selected_suppliers_count,
    )


def calculate_offer_item(item: SupplierOfferItem) -> None:
    if item.selected_quantity and item.selected_quantity > item.offered_quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected quantity cannot exceed offered quantity",
        )
    base_quantity = item.selected_quantity if item.selected_quantity and item.selected_quantity > 0 else item.offered_quantity
    item.is_selected = bool(item.selected_quantity and item.selected_quantity > 0)
    item.subtotal = money(base_quantity * item.unit_price)
    item.vat_amount = money(item.subtotal * item.vat_rate / Decimal("100"))
    item.total_with_vat = money(item.subtotal + item.vat_amount)


def selected_line_total(item: SupplierOfferItem) -> Decimal:
    if not item.selected_quantity or item.selected_quantity <= 0:
        return Decimal("0")
    subtotal = money(item.selected_quantity * item.unit_price)
    vat_amount = money(subtotal * item.vat_rate / Decimal("100"))
    return money(subtotal + vat_amount)


def recalculate_offer(offer: SupplierOffer) -> None:
    for item in offer.items:
        calculate_offer_item(item)
    offer.total_product_amount = money(sum((item.subtotal for item in offer.items), Decimal("0")))
    offer.total_vat_amount = money(sum((item.vat_amount for item in offer.items), Decimal("0")))
    offer.total_amount = money(offer.total_product_amount + offer.total_vat_amount + offer.estimated_delivery_cost)
    offer.is_selected = any(item.is_selected for item in offer.items)
    if offer.is_selected and offer.status in {SupplierOfferStatus.draft, SupplierOfferStatus.sent, SupplierOfferStatus.received}:
        offer.status = SupplierOfferStatus.partially_selected


def ensure_procurement_for_order(db: Session, order: Order, created_by: str | None = None) -> Procurement:
    procurement = order.procurement
    if procurement:
        return procurement
    procurement = Procurement(
        order_id=order.id,
        contract_id=order.contract_id,
        client_id=order.client_id,
        procurement_number=f"PROC-{order.order_number}",
        procurement_date=order.order_date or date.today(),
        required_date=order.required_date,
        status=ProcurementStatus.draft,
        source_type=order.source_type.value if hasattr(order.source_type, "value") else str(order.source_type),
        fulfillment_type=order.fulfillment_type.value if hasattr(order.fulfillment_type, "value") else str(order.fulfillment_type),
        currency=order.currency,
        estimated_purchase_amount=order.product_subtotal,
        created_by=created_by or order.created_by,
    )
    db.add(procurement)
    db.flush()
    sync_procurement_items_from_order(db, procurement, force=True)
    return procurement


def has_selected_offer_items(procurement: Procurement) -> bool:
    return any(item.selected_quantity and item.selected_quantity > 0 for offer in procurement.offers for item in offer.items)


def sync_procurement_items_from_order(db: Session, procurement: Procurement, force: bool = False) -> None:
    if not force and has_selected_offer_items(procurement):
        return
    existing = {item.order_item_id: item for item in procurement.items}
    live_ids = {item.id for item in procurement.order.items}
    for item in list(procurement.items):
        if item.order_item_id not in live_ids:
            db.delete(item)
    for order_item in procurement.order.items:
        current = existing.get(order_item.id)
        if current:
            current.contract_item_id = order_item.contract_item_id
            current.product_name = order_item.product_name
            current.unit = order_item.unit
            current.required_quantity = order_item.quantity
        else:
            procurement.items.append(
                ProcurementItem(
                    order_item_id=order_item.id,
                    contract_item_id=order_item.contract_item_id,
                    product_name=order_item.product_name,
                    unit=order_item.unit,
                    required_quantity=order_item.quantity,
                    purchased_quantity=Decimal("0"),
                )
            )
    procurement.contract_id = procurement.order.contract_id
    procurement.client_id = procurement.order.client_id
    procurement.required_date = procurement.order.required_date
    procurement.source_type = procurement.order.source_type.value if hasattr(procurement.order.source_type, "value") else str(procurement.order.source_type)
    procurement.fulfillment_type = (
        procurement.order.fulfillment_type.value if hasattr(procurement.order.fulfillment_type, "value") else str(procurement.order.fulfillment_type)
    )
    procurement.currency = procurement.order.currency
    procurement.estimated_purchase_amount = procurement.order.product_subtotal
    db.flush()
    recalculate_procurement(db, procurement)


def validate_selection_limits(procurement: Procurement) -> None:
    for procurement_item in procurement.items:
        total_selected = qty(
            sum(
                (offer_item.selected_quantity or Decimal("0"))
                for offer_item in procurement_item.offer_items
                if offer_item.selected_quantity and offer_item.selected_quantity > 0
            )
        )
        if total_selected > procurement_item.required_quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Selected quantity for {procurement_item.product_name} exceeds required quantity",
            )


def update_order_supplier_from_procurement(db: Session, procurement: Procurement) -> None:
    selected_offers = []
    for offer in procurement.offers:
        if any(item.selected_quantity and item.selected_quantity > 0 for item in offer.items):
            selected_offers.append(offer)
    if not selected_offers:
        procurement.order.supplier_id = None
        procurement.order.supplier_name = None
        procurement.order.supplier_status = SupplierStatus.searching if procurement.offers else SupplierStatus.not_selected
        sync_order_status(procurement.order, db=db)
        return
    supplier_keys = {(offer.supplier_id, offer.supplier_name) for offer in selected_offers}
    if len(supplier_keys) == 1:
        supplier_id, supplier_name = next(iter(supplier_keys))
        procurement.order.supplier_id = supplier_id
        procurement.order.supplier_name = supplier_name
    else:
        procurement.order.supplier_id = None
        procurement.order.supplier_name = "Multiple suppliers"
    confirmed = procurement.status in {
        ProcurementStatus.supplier_confirmed,
        ProcurementStatus.purchase_approved,
        ProcurementStatus.waiting_supplier_ready,
        ProcurementStatus.ready_for_pickup,
        ProcurementStatus.ready_for_delivery,
        ProcurementStatus.completed,
    }
    procurement.order.supplier_status = SupplierStatus.confirmed if confirmed else SupplierStatus.selected
    procurement.order.status = OrderStatus.supplier_confirmed if confirmed else OrderStatus.supplier_selected
    sync_order_status(procurement.order, db=db)


def recalculate_procurement(db: Session, procurement: Procurement) -> None:
    for offer in procurement.offers:
        recalculate_offer(offer)
    for procurement_item in procurement.items:
        procurement_item.purchased_quantity = qty(
            sum(
                (offer_item.selected_quantity or Decimal("0"))
                for offer_item in procurement_item.offer_items
                if offer_item.selected_quantity and offer_item.selected_quantity > 0
            )
        )
    validate_selection_limits(procurement)
    procurement.final_purchase_amount = money(
        sum((selected_line_total(item) for offer in procurement.offers for item in offer.items), Decimal("0"))
    )
    required = qty(sum((item.required_quantity for item in procurement.items), Decimal("0")))
    selected = qty(sum((item.purchased_quantity for item in procurement.items), Decimal("0")))
    if selected <= 0:
        procurement.status = ProcurementStatus.offers_received if procurement.offers else procurement.status
    elif selected < required:
        procurement.status = ProcurementStatus.supplier_selected
    elif procurement.status not in {
        ProcurementStatus.supplier_confirmed,
        ProcurementStatus.purchase_approved,
        ProcurementStatus.waiting_supplier_ready,
        ProcurementStatus.ready_for_pickup,
        ProcurementStatus.ready_for_delivery,
        ProcurementStatus.completed,
    }:
        procurement.status = ProcurementStatus.supplier_selected
    update_order_supplier_from_procurement(db, procurement)
    db.flush()


@supplier_router.get("", response_model=Page[SupplierListItem])
def list_suppliers(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    stmt = select(Supplier).options(selectinload(Supplier.contacts), selectinload(Supplier.addresses))
    if search:
        value = f"%{search}%"
        stmt = stmt.where(or_(Supplier.name.ilike(value), Supplier.inn.ilike(value), Supplier.phone.ilike(value), Supplier.email.ilike(value)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    suppliers = db.scalars(stmt.order_by(Supplier.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_supplier_list_item(supplier) for supplier in suppliers], total=total, page=page, page_size=page_size)


@supplier_router.post("", response_model=SupplierDetail, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump(exclude={"first_contact", "address", "bank_account"}))
    db.add(supplier)
    db.flush()
    if payload.first_contact:
        supplier.contacts.append(SupplierContact(**payload.first_contact.model_dump()))
    if payload.address:
        supplier.addresses.append(SupplierAddress(**payload.address.model_dump()))
    if payload.bank_account:
        supplier.bank_accounts.append(SupplierBankAccount(**payload.bank_account.model_dump()))
    db.commit()
    return load_supplier_detail(db, supplier.id)


@supplier_router.get("/{supplier_id}", response_model=SupplierDetail)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    return load_supplier_detail(db, supplier_id)


@supplier_router.patch("/{supplier_id}", response_model=SupplierDetail)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    supplier = get_supplier_or_404(db, supplier_id)
    update_model(supplier, payload.model_dump(exclude_unset=True))
    db.commit()
    return load_supplier_detail(db, supplier_id)


@supplier_router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = get_supplier_or_404(db, supplier_id)
    db.delete(supplier)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/contacts", response_model=SupplierContactRead, status_code=status.HTTP_201_CREATED)
def create_supplier_contact(supplier_id: int, payload: SupplierContactBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    if payload.is_primary:
        db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id).update({SupplierContact.is_primary: False}, synchronize_session=False)
    item = SupplierContact(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/contacts/{item_id}", response_model=SupplierContactRead)
def update_supplier_contact(supplier_id: int, item_id: int, payload: SupplierContactUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierContact, supplier_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id, SupplierContact.id != item_id).update({SupplierContact.is_primary: False}, synchronize_session=False)
    update_model(item, data)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/contacts/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_contact(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierContact, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/addresses", response_model=SupplierAddressRead, status_code=status.HTTP_201_CREATED)
def create_supplier_address(supplier_id: int, payload: SupplierAddressBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierAddress(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/addresses/{item_id}", response_model=SupplierAddressRead)
def update_supplier_address(supplier_id: int, item_id: int, payload: SupplierAddressUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierAddress, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/addresses/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_address(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierAddress, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/bank-accounts", response_model=SupplierBankAccountRead, status_code=status.HTTP_201_CREATED)
def create_supplier_bank_account(supplier_id: int, payload: SupplierBankAccountBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    if payload.is_primary:
        db.query(SupplierBankAccount).filter(SupplierBankAccount.supplier_id == supplier_id).update({SupplierBankAccount.is_primary: False}, synchronize_session=False)
    item = SupplierBankAccount(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/bank-accounts/{item_id}", response_model=SupplierBankAccountRead)
def update_supplier_bank_account(supplier_id: int, item_id: int, payload: SupplierBankAccountUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierBankAccount, supplier_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.query(SupplierBankAccount).filter(SupplierBankAccount.supplier_id == supplier_id, SupplierBankAccount.id != item_id).update({SupplierBankAccount.is_primary: False}, synchronize_session=False)
    update_model(item, data)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/bank-accounts/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_bank_account(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierBankAccount, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/documents", response_model=SupplierDocumentRead, status_code=status.HTTP_201_CREATED)
def create_supplier_document(supplier_id: int, payload: SupplierDocumentCreate, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierDocument(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/documents/{item_id}", response_model=SupplierDocumentRead)
def update_supplier_document(supplier_id: int, item_id: int, payload: SupplierDocumentUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierDocument, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/documents/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_document(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierDocument, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/notes", response_model=SupplierNoteRead, status_code=status.HTTP_201_CREATED)
def create_supplier_note(supplier_id: int, payload: SupplierNoteCreate, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierNote(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/notes/{item_id}", response_model=SupplierNoteRead)
def update_supplier_note(supplier_id: int, item_id: int, payload: SupplierNoteUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierNote, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/notes/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_note(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierNote, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@procurement_router.get("", response_model=Page[ProcurementListItem])
def list_procurements(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: int | None = None,
    contract_id: int | None = None,
    order_id: int | None = None,
    supplier_id: int | None = None,
):
    stmt = (
        select(Procurement)
        .join(Order)
        .join(Client, Procurement.client_id == Client.id)
        .join(Contract, Procurement.contract_id == Contract.id)
        .outerjoin(ProcurementItem)
        .options(
            selectinload(Procurement.client),
            selectinload(Procurement.contract),
            selectinload(Procurement.order),
            selectinload(Procurement.items),
            selectinload(Procurement.offers).selectinload(SupplierOffer.items),
        )
        .distinct()
    )
    if supplier_id:
        stmt = stmt.outerjoin(SupplierOffer).where(SupplierOffer.supplier_id == supplier_id)
    if search:
        value = f"%{search}%"
        stmt = stmt.where(
            or_(
                Procurement.procurement_number.ilike(value),
                Order.order_number.ilike(value),
                Client.name.ilike(value),
                Contract.contract_number.ilike(value),
                ProcurementItem.product_name.ilike(value),
            )
        )
    if status_filter:
        stmt = stmt.where(Procurement.status == status_filter)
    if client_id:
        stmt = stmt.where(Procurement.client_id == client_id)
    if contract_id:
        stmt = stmt.where(Procurement.contract_id == contract_id)
    if order_id:
        stmt = stmt.where(Procurement.order_id == order_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Procurement.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_procurement_list_item(row) for row in rows], total=total, page=page, page_size=page_size)


@procurement_router.post("", response_model=ProcurementDetail, status_code=status.HTTP_201_CREATED)
def create_procurement(payload: ProcurementCreate, db: Session = Depends(get_db)):
    order = db.scalars(select(Order).where(Order.id == payload.order_id).options(selectinload(Order.items), selectinload(Order.procurement))).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order does not exist")
    procurement = ensure_procurement_for_order(db, order, payload.created_by)
    if payload.procurement_number:
        procurement.procurement_number = payload.procurement_number
    if payload.procurement_date:
        procurement.procurement_date = payload.procurement_date
    if payload.required_date:
        procurement.required_date = payload.required_date
    procurement.status = payload.status
    procurement.notes = payload.notes
    db.commit()
    return get_procurement(procurement.id, db)


@procurement_router.get("/{procurement_id}", response_model=ProcurementDetail)
def get_procurement(procurement_id: int, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    result = ProcurementDetail.model_validate(procurement)
    return result.model_copy(update={"summary": procurement_summary(procurement)})


@procurement_router.post("/{procurement_id}/documents", response_model=ProcurementDocumentRead, status_code=status.HTTP_201_CREATED)
def create_procurement_document(procurement_id: int, payload: ProcurementDocumentCreate, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    if payload.supplier_offer_id and not any(offer.id == payload.supplier_offer_id for offer in procurement.offers):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Supplier offer must belong to this procurement")
    item = ProcurementDocument(procurement_id=procurement_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@procurement_router.patch("/{procurement_id}/documents/{item_id}", response_model=ProcurementDocumentRead)
def update_procurement_document(procurement_id: int, item_id: int, payload: ProcurementDocumentUpdate, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    item = get_procurement_child_or_404(db, ProcurementDocument, procurement_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("supplier_offer_id") and not any(offer.id == data["supplier_offer_id"] for offer in procurement.offers):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Supplier offer must belong to this procurement")
    update_model(item, data)
    db.commit()
    db.refresh(item)
    return item


@procurement_router.delete("/{procurement_id}/documents/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procurement_document(procurement_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_procurement_child_or_404(db, ProcurementDocument, procurement_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@procurement_router.post("/{procurement_id}/notes", response_model=ProcurementNoteRead, status_code=status.HTTP_201_CREATED)
def create_procurement_note(procurement_id: int, payload: ProcurementNoteCreate, db: Session = Depends(get_db)):
    load_procurement_detail(db, procurement_id)
    item = ProcurementNote(procurement_id=procurement_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@procurement_router.patch("/{procurement_id}/notes/{item_id}", response_model=ProcurementNoteRead)
def update_procurement_note(procurement_id: int, item_id: int, payload: ProcurementNoteUpdate, db: Session = Depends(get_db)):
    item = get_procurement_child_or_404(db, ProcurementNote, procurement_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@procurement_router.delete("/{procurement_id}/notes/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procurement_note(procurement_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_procurement_child_or_404(db, ProcurementNote, procurement_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@procurement_router.post("/{procurement_id}/offers", response_model=SupplierOfferRead, status_code=status.HTTP_201_CREATED)
def create_supplier_offer(procurement_id: int, payload: SupplierOfferCreate, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    supplier = db.get(Supplier, payload.supplier_id) if payload.supplier_id else None
    if payload.supplier_id and not supplier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Supplier does not exist")
    offer = SupplierOffer(
        procurement_id=procurement.id,
        **payload.model_dump(exclude={"items"}, exclude_unset=True),
    )
    if supplier:
        offer.supplier_name = supplier.name
    db.add(offer)
    procurement_items = {item.id: item for item in procurement.items}
    for item_payload in payload.items:
        procurement_item = procurement_items.get(item_payload.procurement_item_id)
        if not procurement_item:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Offer item must reference this procurement")
        offer.items.append(
            SupplierOfferItem(
                procurement_item=procurement_item,
                order_item_id=procurement_item.order_item_id,
                contract_item_id=procurement_item.contract_item_id,
                product_name=procurement_item.product_name,
                unit=procurement_item.unit,
                **item_payload.model_dump(exclude={"procurement_item_id"}),
            )
        )
    recalculate_procurement(db, procurement)
    db.commit()
    db.refresh(offer)
    return offer


@procurement_router.patch("/offer-items/{offer_item_id}", response_model=SupplierOfferItemRead)
def update_offer_item_selection(offer_item_id: int, selected_quantity: Decimal = Query(..., ge=0), db: Session = Depends(get_db)):
    item = db.get(SupplierOfferItem, offer_item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer item not found")
    procurement = load_procurement_detail(db, item.offer.procurement_id)
    item.selected_quantity = selected_quantity
    calculate_offer_item(item)
    recalculate_procurement(db, procurement)
    db.commit()
    db.refresh(item)
    return item


@procurement_router.post("/{procurement_id}/offers/{offer_id}/confirm", response_model=SupplierOfferRead)
def confirm_supplier_offer(procurement_id: int, offer_id: int, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    offer = next((row for row in procurement.offers if row.id == offer_id), None)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier offer not found")
    if not any(item.selected_quantity and item.selected_quantity > 0 for item in offer.items):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select at least one offer item before confirmation")
    offer.status = SupplierOfferStatus.selected
    procurement.status = ProcurementStatus.supplier_confirmed
    recalculate_procurement(db, procurement)
    procurement.status = ProcurementStatus.supplier_confirmed
    update_order_supplier_from_procurement(db, procurement)
    db.commit()
    db.refresh(offer)
    return offer


@procurement_router.delete("/{procurement_id}/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_offer(procurement_id: int, offer_id: int, db: Session = Depends(get_db)):
    procurement = load_procurement_detail(db, procurement_id)
    offer = next((row for row in procurement.offers if row.id == offer_id), None)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier offer not found")
    db.delete(offer)
    db.flush()
    recalculate_procurement(db, procurement)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
