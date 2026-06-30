from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.delivery import DeliveryBatch, Logistics
from backend.app.models.procurement import Procurement, Supplier, SupplierOffer, SupplierOfferItem
from backend.app.models.supplier_finance import (
    SupplierFinanceDocument,
    SupplierFinanceNote,
    SupplierInvoice,
    SupplierInvoiceItem,
    SupplierInvoiceStatus,
    SupplierInvoiceType,
    SupplierPayment,
    SupplierPaymentAllocation,
    SupplierPaymentStatus,
)
from backend.app.schemas.client import Page
from backend.app.schemas.supplier_finance import (
    GenerateSupplierInvoicesRequest,
    SupplierBalanceSummary,
    SupplierFinanceDocumentCreate,
    SupplierFinanceDocumentRead,
    SupplierFinanceNoteCreate,
    SupplierFinanceNoteRead,
    SupplierInvoiceCreate,
    SupplierInvoiceDetail,
    SupplierInvoiceItemCreate,
    SupplierInvoiceListItem,
    SupplierInvoiceSummary,
    SupplierInvoiceUpdate,
    SupplierPaymentAllocationCreate,
    SupplierPaymentAllocationRead,
    SupplierPaymentCreate,
    SupplierPaymentDetail,
    SupplierPaymentListItem,
    SupplierPaymentRead,
    SupplierPaymentSummary,
    SupplierPaymentUpdate,
)
from backend.app.services.order_status import sync_order_status


invoice_router = APIRouter(prefix="/api/supplier-invoices", tags=["supplier-invoices"])
payment_router = APIRouter(prefix="/api/supplier-payments", tags=["supplier-payments"])
finance_router = APIRouter(prefix="/api/supplier-finance", tags=["supplier-finance"])
MONEY = Decimal("0.01")


def money(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def calculate_item(item: SupplierInvoiceItem) -> None:
    item.subtotal = money(item.quantity * item.unit_price)
    item.vat_amount = money(item.subtotal * item.vat_rate / Decimal("100"))
    item.total_with_vat = money(item.subtotal + item.vat_amount)


def recalculate_invoice(db: Session, invoice: SupplierInvoice) -> None:
    for item in invoice.items:
        calculate_item(item)
    invoice.subtotal_amount = money(sum((item.subtotal for item in invoice.items), Decimal("0")))
    invoice.vat_amount = money(sum((item.vat_amount for item in invoice.items), Decimal("0")))
    invoice.total_amount = money(sum((item.total_with_vat for item in invoice.items), Decimal("0")))
    invoice.paid_amount = money(sum((allocation.allocated_amount for allocation in invoice.allocations), Decimal("0")))
    invoice.remaining_amount = money(invoice.total_amount - invoice.paid_amount)
    if invoice.status not in {SupplierInvoiceStatus.cancelled, SupplierInvoiceStatus.draft}:
        if invoice.remaining_amount <= 0:
            invoice.status = SupplierInvoiceStatus.paid
        elif invoice.paid_amount > 0:
            invoice.status = SupplierInvoiceStatus.partially_paid
        elif invoice.due_date < date.today():
            invoice.status = SupplierInvoiceStatus.overdue
        else:
            invoice.status = SupplierInvoiceStatus.received
    db.flush()


def recalculate_payment(db: Session, payment: SupplierPayment) -> None:
    allocated = money(sum((allocation.allocated_amount for allocation in payment.allocations), Decimal("0")))
    if payment.status != SupplierPaymentStatus.cancelled:
        if allocated <= 0:
            payment.status = SupplierPaymentStatus.unallocated
        elif allocated < payment.amount:
            payment.status = SupplierPaymentStatus.partially_allocated
        else:
            payment.status = SupplierPaymentStatus.allocated
    db.flush()


def validate_invoice_links(db: Session, invoice: SupplierInvoice) -> None:
    if not db.get(Supplier, invoice.supplier_id):
        raise HTTPException(status_code=400, detail="Supplier does not exist")
    procurement = db.get(Procurement, invoice.procurement_id)
    if not procurement:
        raise HTTPException(status_code=400, detail="Procurement does not exist")
    if invoice.supplier_offer_id:
        offer = db.get(SupplierOffer, invoice.supplier_offer_id)
        if not offer or offer.procurement_id != invoice.procurement_id or offer.supplier_id != invoice.supplier_id:
            raise HTTPException(status_code=422, detail="Supplier offer must match supplier and procurement")
    if invoice.delivery_batch_id:
        batch = db.get(DeliveryBatch, invoice.delivery_batch_id)
        if not batch or batch.order_id != procurement.order_id:
            raise HTTPException(status_code=422, detail="Delivery batch must belong to the procurement order")
    if invoice.logistics_id:
        logistics = db.get(Logistics, invoice.logistics_id)
        if not logistics or (invoice.delivery_batch_id and logistics.delivery_batch_id != invoice.delivery_batch_id):
            raise HTTPException(status_code=422, detail="Logistics must match the delivery batch")


def load_invoice(db: Session, invoice_id: int) -> SupplierInvoice:
    invoice = db.scalars(
        select(SupplierInvoice)
        .where(SupplierInvoice.id == invoice_id)
        .options(
            selectinload(SupplierInvoice.supplier),
            selectinload(SupplierInvoice.procurement),
            selectinload(SupplierInvoice.supplier_offer).selectinload(SupplierOffer.items),
            selectinload(SupplierInvoice.delivery_batch),
            selectinload(SupplierInvoice.logistics),
            selectinload(SupplierInvoice.items),
            selectinload(SupplierInvoice.allocations),
            selectinload(SupplierInvoice.documents),
            selectinload(SupplierInvoice.notes_history),
        )
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    return invoice


def load_payment(db: Session, payment_id: int) -> SupplierPayment:
    payment = db.scalars(
        select(SupplierPayment)
        .where(SupplierPayment.id == payment_id)
        .options(
            selectinload(SupplierPayment.supplier),
            selectinload(SupplierPayment.allocations),
            selectinload(SupplierPayment.documents),
            selectinload(SupplierPayment.notes_history),
        )
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Supplier payment not found")
    return payment


def invoice_summary(invoice: SupplierInvoice) -> SupplierInvoiceSummary:
    return SupplierInvoiceSummary(
        subtotal_amount=invoice.subtotal_amount,
        vat_amount=invoice.vat_amount,
        total_amount=invoice.total_amount,
        paid_amount=invoice.paid_amount,
        remaining_amount=invoice.remaining_amount,
        items_count=len(invoice.items),
        allocations_count=len(invoice.allocations),
    )


def payment_summary(payment: SupplierPayment) -> SupplierPaymentSummary:
    allocated = money(sum((allocation.allocated_amount for allocation in payment.allocations), Decimal("0")))
    return SupplierPaymentSummary(
        amount=payment.amount,
        allocated_amount=allocated,
        unallocated_amount=money(payment.amount - allocated),
        allocations_count=len(payment.allocations),
    )


def validate_allocations(db: Session, payment: SupplierPayment, allocations: list[SupplierPaymentAllocationCreate], exclude_payment_id: int | None = None) -> None:
    total = money(sum((item.allocated_amount for item in allocations), Decimal("0")))
    if total > payment.amount:
        raise HTTPException(status_code=422, detail="Allocated amount cannot exceed payment amount")
    for item in allocations:
        invoice = load_invoice(db, item.supplier_invoice_id)
        if invoice.supplier_id != payment.supplier_id:
            raise HTTPException(status_code=422, detail="Payment and invoice must belong to the same supplier")
        current_from_payment = sum((a.allocated_amount for a in invoice.allocations if exclude_payment_id and a.supplier_payment_id == exclude_payment_id), Decimal("0"))
        available = money(invoice.remaining_amount + current_from_payment)
        if item.allocated_amount > available:
            raise HTTPException(status_code=422, detail="Allocated amount cannot exceed invoice remaining amount")


def sync_orders_for_supplier_invoices(db: Session, invoices: list[SupplierInvoice]) -> None:
    procurement_ids = {invoice.procurement_id for invoice in invoices if invoice and invoice.procurement_id}
    for procurement_id in procurement_ids:
        procurement = db.scalars(select(Procurement).where(Procurement.id == procurement_id).options(selectinload(Procurement.order))).first()
        if procurement and procurement.order:
            sync_order_status(procurement.order, db=db)


@invoice_router.get("", response_model=Page[SupplierInvoiceListItem])
def list_invoices(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    invoice_type: str | None = None,
    supplier_id: int | None = None,
    procurement_id: int | None = None,
    overdue_only: bool = False,
):
    stmt = (
        select(SupplierInvoice)
        .join(Supplier)
        .join(Procurement)
        .outerjoin(SupplierOffer)
        .outerjoin(DeliveryBatch)
        .options(
            selectinload(SupplierInvoice.supplier),
            selectinload(SupplierInvoice.procurement),
            selectinload(SupplierInvoice.supplier_offer).selectinload(SupplierOffer.items),
            selectinload(SupplierInvoice.delivery_batch),
        )
        .distinct()
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(SupplierInvoice.invoice_number.ilike(value), Supplier.name.ilike(value), Supplier.inn.ilike(value), Procurement.procurement_number.ilike(value), SupplierOffer.offer_number.ilike(value), DeliveryBatch.batch_number.ilike(value)))
    if status_filter:
        filters.append(SupplierInvoice.status == status_filter)
    if invoice_type:
        filters.append(SupplierInvoice.invoice_type == invoice_type)
    if supplier_id:
        filters.append(SupplierInvoice.supplier_id == supplier_id)
    if procurement_id:
        filters.append(SupplierInvoice.procurement_id == procurement_id)
    if overdue_only:
        filters.append(SupplierInvoice.remaining_amount > 0)
        filters.append(SupplierInvoice.due_date < date.today())
        filters.append(SupplierInvoice.status != SupplierInvoiceStatus.cancelled)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(SupplierInvoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=list(rows), total=total, page=page, page_size=page_size)


@invoice_router.post("", response_model=SupplierInvoiceDetail, status_code=201)
def create_invoice(payload: SupplierInvoiceCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"items", "documents", "initial_note"})
    invoice = SupplierInvoice(**data)
    validate_invoice_links(db, invoice)
    db.add(invoice)
    db.flush()
    for item_payload in payload.items:
        item = SupplierInvoiceItem(supplier_invoice_id=invoice.id, **item_payload.model_dump())
        calculate_item(item)
        db.add(item)
    for document_payload in payload.documents:
        doc_data = document_payload.model_dump()
        doc_data["supplier_id"] = doc_data.get("supplier_id") or invoice.supplier_id
        doc_data["procurement_id"] = doc_data.get("procurement_id") or invoice.procurement_id
        doc_data["supplier_invoice_id"] = invoice.id
        db.add(SupplierFinanceDocument(**doc_data))
    if payload.initial_note:
        note_data = payload.initial_note.model_dump()
        note_data["supplier_id"] = note_data.get("supplier_id") or invoice.supplier_id
        note_data["procurement_id"] = note_data.get("procurement_id") or invoice.procurement_id
        note_data["supplier_invoice_id"] = invoice.id
        db.add(SupplierFinanceNote(**note_data))
    db.flush()
    db.refresh(invoice)
    recalculate_invoice(db, invoice)
    sync_orders_for_supplier_invoices(db, [invoice])
    db.commit()
    return get_invoice_detail(invoice.id, db)


@invoice_router.get("/{invoice_id}", response_model=SupplierInvoiceDetail)
def get_invoice_detail(invoice_id: int, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    result = SupplierInvoiceDetail.model_validate(invoice)
    return result.model_copy(update={"summary": invoice_summary(invoice)})


@invoice_router.patch("/{invoice_id}", response_model=SupplierInvoiceDetail)
def update_invoice(invoice_id: int, payload: SupplierInvoiceUpdate, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    update_model(invoice, data)
    validate_invoice_links(db, invoice)
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=422, detail="Invoice must have at least one item")
        invoice.items.clear()
        db.flush()
        for item_payload in payload.items:
            invoice.items.append(SupplierInvoiceItem(supplier_invoice_id=invoice.id, **item_payload.model_dump()))
    recalculate_invoice(db, invoice)
    sync_orders_for_supplier_invoices(db, [invoice])
    db.commit()
    return get_invoice_detail(invoice.id, db)


@invoice_router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    payments = [allocation.payment for allocation in invoice.allocations]
    procurement_id = invoice.procurement_id
    db.delete(invoice)
    db.flush()
    for payment in payments:
        recalculate_payment(db, payment)
    if procurement_id:
        procurement = db.scalars(select(Procurement).where(Procurement.id == procurement_id).options(selectinload(Procurement.order))).first()
        if procurement and procurement.order:
            sync_order_status(procurement.order, db=db)
    db.commit()
    return Response(status_code=204)


@payment_router.get("", response_model=Page[SupplierPaymentListItem])
def list_payments(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    supplier_id: int | None = None,
    unallocated_only: bool = False,
):
    stmt = select(SupplierPayment).join(Supplier).options(selectinload(SupplierPayment.supplier), selectinload(SupplierPayment.allocations)).distinct()
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(SupplierPayment.payment_number.ilike(value), Supplier.name.ilike(value), Supplier.inn.ilike(value), SupplierPayment.reference_number.ilike(value), SupplierPayment.bank_account.ilike(value)))
    if status_filter:
        filters.append(SupplierPayment.status == status_filter)
    if supplier_id:
        filters.append(SupplierPayment.supplier_id == supplier_id)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(SupplierPayment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    items = []
    for payment in rows:
        summary = payment_summary(payment)
        if unallocated_only and summary.unallocated_amount <= 0:
            continue
        items.append(SupplierPaymentListItem(**SupplierPaymentRead.model_validate(payment).model_dump(), supplier=payment.supplier, allocated_amount=summary.allocated_amount, unallocated_amount=summary.unallocated_amount))
    return Page(items=items, total=total, page=page, page_size=page_size)


@payment_router.post("", response_model=SupplierPaymentDetail, status_code=201)
def create_payment(payload: SupplierPaymentCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"allocations", "documents", "initial_note"})
    payment = SupplierPayment(**data)
    if not db.get(Supplier, payment.supplier_id):
        raise HTTPException(status_code=400, detail="Supplier does not exist")
    db.add(payment)
    db.flush()
    validate_allocations(db, payment, payload.allocations)
    for allocation_payload in payload.allocations:
        db.add(SupplierPaymentAllocation(supplier_payment_id=payment.id, **allocation_payload.model_dump()))
    for document_payload in payload.documents:
        doc_data = document_payload.model_dump()
        doc_data["supplier_id"] = doc_data.get("supplier_id") or payment.supplier_id
        doc_data["supplier_payment_id"] = payment.id
        db.add(SupplierFinanceDocument(**doc_data))
    if payload.initial_note:
        note_data = payload.initial_note.model_dump()
        note_data["supplier_id"] = note_data.get("supplier_id") or payment.supplier_id
        note_data["supplier_payment_id"] = payment.id
        db.add(SupplierFinanceNote(**note_data))
    db.flush()
    db.refresh(payment)
    for allocation in payment.allocations:
        recalculate_invoice(db, allocation.invoice)
    sync_orders_for_supplier_invoices(db, [allocation.invoice for allocation in payment.allocations])
    recalculate_payment(db, payment)
    db.commit()
    return get_payment_detail(payment.id, db)


@payment_router.get("/{payment_id}", response_model=SupplierPaymentDetail)
def get_payment_detail(payment_id: int, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    result = SupplierPaymentDetail.model_validate(payment)
    return result.model_copy(update={"summary": payment_summary(payment)})


@payment_router.patch("/{payment_id}", response_model=SupplierPaymentDetail)
def update_payment(payment_id: int, payload: SupplierPaymentUpdate, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    data = payload.model_dump(exclude_unset=True, exclude={"allocations"})
    update_model(payment, data)
    if payload.supplier_id and not db.get(Supplier, payload.supplier_id):
        raise HTTPException(status_code=400, detail="Supplier does not exist")
    affected = []
    if payload.allocations is not None:
        validate_allocations(db, payment, payload.allocations, exclude_payment_id=payment.id)
        affected = [allocation.invoice for allocation in payment.allocations]
        payment.allocations.clear()
        db.flush()
        for allocation_payload in payload.allocations:
            payment.allocations.append(SupplierPaymentAllocation(supplier_payment_id=payment.id, **allocation_payload.model_dump()))
        for invoice in affected:
            recalculate_invoice(db, invoice)
    db.flush()
    for allocation in payment.allocations:
        recalculate_invoice(db, allocation.invoice)
    sync_orders_for_supplier_invoices(db, affected + [allocation.invoice for allocation in payment.allocations])
    recalculate_payment(db, payment)
    db.commit()
    return get_payment_detail(payment.id, db)


@payment_router.delete("/{payment_id}", status_code=204)
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    invoices = [allocation.invoice for allocation in payment.allocations]
    db.delete(payment)
    db.flush()
    for invoice in invoices:
        recalculate_invoice(db, invoice)
    sync_orders_for_supplier_invoices(db, invoices)
    db.commit()
    return Response(status_code=204)


@payment_router.post("/{payment_id}/allocations", response_model=SupplierPaymentAllocationRead, status_code=201)
def create_allocation(payment_id: int, payload: SupplierPaymentAllocationCreate, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    validate_allocations(db, payment, [payload])
    allocation = SupplierPaymentAllocation(supplier_payment_id=payment.id, **payload.model_dump())
    db.add(allocation)
    db.flush()
    recalculate_invoice(db, allocation.invoice)
    recalculate_payment(db, payment)
    sync_orders_for_supplier_invoices(db, [allocation.invoice])
    db.commit()
    db.refresh(allocation)
    return allocation


@finance_router.get("/suppliers/{supplier_id}/balance", response_model=SupplierBalanceSummary)
def supplier_balance(supplier_id: int, db: Session = Depends(get_db)):
    if not db.get(Supplier, supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
    total_invoiced = money(
        db.scalar(
            select(func.coalesce(func.sum(SupplierInvoice.total_amount), 0)).where(
                SupplierInvoice.supplier_id == supplier_id,
                SupplierInvoice.status != SupplierInvoiceStatus.cancelled,
            )
        )
    )
    total_paid = money(
        db.scalar(
            select(func.coalesce(func.sum(SupplierPaymentAllocation.allocated_amount), 0))
            .join(SupplierInvoice)
            .join(SupplierPayment)
            .where(
                SupplierInvoice.supplier_id == supplier_id,
                SupplierInvoice.status != SupplierInvoiceStatus.cancelled,
                SupplierPayment.status != SupplierPaymentStatus.cancelled,
            )
        )
    )
    return SupplierBalanceSummary(supplier_id=supplier_id, total_invoiced=total_invoiced, total_paid=total_paid, balance=money(total_invoiced - total_paid))


@finance_router.post("/procurements/{procurement_id}/generate-invoices", response_model=list[SupplierInvoiceDetail])
def generate_invoices_from_procurement(procurement_id: int, payload: GenerateSupplierInvoicesRequest, db: Session = Depends(get_db)):
    procurement = db.scalars(
        select(Procurement)
        .where(Procurement.id == procurement_id)
        .options(selectinload(Procurement.offers).selectinload(SupplierOffer.items))
    ).first()
    if not procurement:
        raise HTTPException(status_code=404, detail="Procurement not found")

    selected: dict[int, list[tuple[SupplierOffer, SupplierOfferItem]]] = {}
    for offer in procurement.offers:
        if not offer.supplier_id:
            continue
        for item in offer.items:
            if item.selected_quantity and item.selected_quantity > 0:
                selected.setdefault(offer.supplier_id, []).append((offer, item))
    if not selected:
        raise HTTPException(status_code=422, detail="No selected supplier offer items found")

    created = []
    invoice_date = payload.invoice_date or date.today()
    due_date = payload.due_date or invoice_date
    for supplier_id, rows in selected.items():
        offer_ids = {offer.id for offer, _ in rows}
        duplicate = db.scalars(
            select(SupplierInvoice)
            .join(SupplierInvoiceItem)
            .where(
                SupplierInvoice.procurement_id == procurement.id,
                SupplierInvoice.supplier_id == supplier_id,
                SupplierInvoiceItem.supplier_offer_item_id.in_([item.id for _, item in rows]),
                SupplierInvoice.status != SupplierInvoiceStatus.cancelled,
            )
        ).first()
        if duplicate:
            raise HTTPException(status_code=422, detail="Selected supplier offer items already have a supplier invoice")
        invoice = SupplierInvoice(
            supplier_id=supplier_id,
            procurement_id=procurement.id,
            supplier_offer_id=next(iter(offer_ids)) if len(offer_ids) == 1 else None,
            delivery_batch_id=payload.delivery_batch_id,
            invoice_number=f"SINV-{procurement.procurement_number}-{supplier_id}",
            invoice_date=invoice_date,
            due_date=due_date,
            invoice_type=SupplierInvoiceType.product_purchase,
            status=payload.status,
            currency=procurement.currency,
            created_by=payload.created_by,
        )
        db.add(invoice)
        db.flush()
        for _, offer_item in rows:
            invoice.items.append(
                SupplierInvoiceItem(
                    supplier_invoice_id=invoice.id,
                    procurement_item_id=offer_item.procurement_item_id,
                    supplier_offer_item_id=offer_item.id,
                    description=offer_item.product_name,
                    product_name=offer_item.product_name,
                    unit=offer_item.unit,
                    quantity=offer_item.selected_quantity,
                    unit_price=offer_item.unit_price,
                    vat_rate=offer_item.vat_rate,
                )
            )
        recalculate_invoice(db, invoice)
        created.append(invoice)
    db.commit()
    return [get_invoice_detail(invoice.id, db) for invoice in created]


@finance_router.post("/documents", response_model=SupplierFinanceDocumentRead, status_code=201)
def create_document(payload: SupplierFinanceDocumentCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("supplier_id"):
        invoice = db.get(SupplierInvoice, data.get("supplier_invoice_id")) if data.get("supplier_invoice_id") else None
        payment = db.get(SupplierPayment, data.get("supplier_payment_id")) if data.get("supplier_payment_id") else None
        data["supplier_id"] = invoice.supplier_id if invoice else payment.supplier_id if payment else None
        data["procurement_id"] = data.get("procurement_id") or (invoice.procurement_id if invoice else None)
    if not data.get("supplier_id"):
        raise HTTPException(status_code=422, detail="supplier_id is required")
    document = SupplierFinanceDocument(**data)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@finance_router.post("/notes", response_model=SupplierFinanceNoteRead, status_code=201)
def create_note(payload: SupplierFinanceNoteCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("supplier_id"):
        invoice = db.get(SupplierInvoice, data.get("supplier_invoice_id")) if data.get("supplier_invoice_id") else None
        payment = db.get(SupplierPayment, data.get("supplier_payment_id")) if data.get("supplier_payment_id") else None
        data["supplier_id"] = invoice.supplier_id if invoice else payment.supplier_id if payment else None
        data["procurement_id"] = data.get("procurement_id") or (invoice.procurement_id if invoice else None)
    if not data.get("supplier_id"):
        raise HTTPException(status_code=422, detail="supplier_id is required")
    note = SupplierFinanceNote(**data)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
