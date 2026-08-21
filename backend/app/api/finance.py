from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.paths import UPLOADS_DIR
from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.contract import Contract
from backend.app.models.delivery import DeliveryBatch, Logistics
from backend.app.models.finance import (
    CustomerInvoice,
    CustomerInvoiceItem,
    CustomerPayment,
    FinanceDocument,
    FinanceDocumentType,
    FinanceNote,
    InvoiceStatus,
    InvoiceType,
    PaymentAllocation,
    PaymentStatus,
)
from backend.app.models.order import Order
from backend.app.schemas.client import Page
from backend.app.schemas.finance import (
    AllocationCreate,
    AllocationRead,
    FinanceDocumentCreate,
    FinanceDocumentRead,
    FinanceNoteCreate,
    FinanceNoteRead,
    InvoiceCreate,
    InvoiceDetail,
    InvoiceItemCreate,
    InvoiceListItem,
    InvoiceRead,
    InvoiceSummary,
    InvoiceUpdate,
    PaymentCreate,
    PaymentDetail,
    PaymentListItem,
    PaymentRead,
    PaymentSummary,
    PaymentUpdate,
)
from backend.app.services.auth import require_edit
from backend.app.services.order_status import sync_order_status
from backend.app.services.contract_status import sync_contract_status, sync_contracts_for_invoices


invoice_router = APIRouter(prefix="/api/customer-invoices", tags=["customer-invoices"])
payment_router = APIRouter(prefix="/api/customer-payments", tags=["customer-payments"])
finance_router = APIRouter(prefix="/api/finance", tags=["finance"])
MONEY = Decimal("0.01")
UPLOAD_DIR = UPLOADS_DIR / "finance"


def money(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def calculate_item(item: CustomerInvoiceItem) -> None:
    item.subtotal = money(item.quantity * item.unit_price)
    item.vat_amount = money(item.subtotal * item.vat_rate / Decimal("100"))
    item.total_with_vat = money(item.subtotal + item.vat_amount)


def recalculate_invoice(db: Session, invoice: CustomerInvoice) -> None:
    for item in invoice.items:
        calculate_item(item)
    invoice.subtotal_amount = money(sum((item.subtotal for item in invoice.items), Decimal("0")))
    invoice.vat_amount = money(sum((item.vat_amount for item in invoice.items), Decimal("0")))
    invoice.total_amount = money(sum((item.total_with_vat for item in invoice.items), Decimal("0")))
    invoice.paid_amount = money(sum((allocation.allocated_amount for allocation in invoice.allocations), Decimal("0")))
    invoice.remaining_amount = money(invoice.total_amount - invoice.paid_amount)
    if invoice.status != InvoiceStatus.cancelled and invoice.status != InvoiceStatus.draft:
        if invoice.remaining_amount <= 0:
            invoice.status = InvoiceStatus.paid
        elif invoice.paid_amount > 0:
            invoice.status = InvoiceStatus.partially_paid
        elif invoice.due_date < date.today():
            invoice.status = InvoiceStatus.overdue
        else:
            invoice.status = InvoiceStatus.issued
    db.flush()


def recalculate_payment(db: Session, payment: CustomerPayment) -> None:
    allocated = money(sum((allocation.allocated_amount for allocation in payment.allocations), Decimal("0")))
    if payment.status != PaymentStatus.cancelled:
        if allocated <= 0:
            payment.status = PaymentStatus.unallocated
        elif allocated < payment.amount:
            payment.status = PaymentStatus.partially_allocated
        else:
            payment.status = PaymentStatus.allocated
    db.flush()


def validate_invoice_links(db: Session, invoice: CustomerInvoice) -> None:
    if not db.get(Client, invoice.client_id):
        raise HTTPException(status_code=400, detail="Mijoz mavjud emas.")
    contract = db.get(Contract, invoice.contract_id) if invoice.contract_id else None
    if invoice.contract_id and (not contract or contract.client_id != invoice.client_id):
        raise HTTPException(status_code=422, detail="Shartnoma tanlangan mijozga tegishli bo'lishi kerak.")
    order = db.get(Order, invoice.order_id) if invoice.order_id else None
    if invoice.order_id and (not order or order.client_id != invoice.client_id or (invoice.contract_id and order.contract_id != invoice.contract_id)):
        raise HTTPException(status_code=422, detail="Buyurtma tanlangan mijoz va shartnomaga tegishli bo'lishi kerak.")
    batch = db.get(DeliveryBatch, invoice.delivery_batch_id) if invoice.delivery_batch_id else None
    if invoice.delivery_batch_id and (not batch or batch.client_id != invoice.client_id or (invoice.contract_id and batch.contract_id != invoice.contract_id) or (invoice.order_id and batch.order_id != invoice.order_id)):
        raise HTTPException(status_code=422, detail="Yetkazib berish partiyasi tanlangan mijoz, shartnoma va buyurtmaga tegishli bo'lishi kerak.")
    logistics = db.get(Logistics, invoice.logistics_id) if invoice.logistics_id else None
    if invoice.logistics_id and (not logistics or (invoice.delivery_batch_id and logistics.delivery_batch_id != invoice.delivery_batch_id)):
        raise HTTPException(status_code=422, detail="Logistika tanlangan yetkazib berish partiyasiga mos kelishi kerak.")
    if invoice.invoice_type in {InvoiceType.advance, InvoiceType.batch_payment, InvoiceType.transport, InvoiceType.adjustment} and not invoice.contract_id:
        raise HTTPException(status_code=422, detail="Ushbu hisob-faktura turi uchun contract_id majburiy.")
    if invoice.invoice_type in {InvoiceType.batch_payment, InvoiceType.transport} and (not invoice.order_id or not invoice.delivery_batch_id):
        raise HTTPException(status_code=422, detail="Ushbu hisob-faktura turi uchun order_id va delivery_batch_id majburiy.")


def load_invoice(db: Session, invoice_id: int) -> CustomerInvoice:
    invoice = db.scalars(
        select(CustomerInvoice)
        .where(CustomerInvoice.id == invoice_id)
        .options(
            selectinload(CustomerInvoice.client),
            selectinload(CustomerInvoice.contract),
            selectinload(CustomerInvoice.order),
            selectinload(CustomerInvoice.delivery_batch),
            selectinload(CustomerInvoice.logistics),
            selectinload(CustomerInvoice.items),
            selectinload(CustomerInvoice.allocations),
            selectinload(CustomerInvoice.documents),
            selectinload(CustomerInvoice.notes_history),
        )
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Hisob-faktura topilmadi.")
    return invoice


def load_payment(db: Session, payment_id: int) -> CustomerPayment:
    payment = db.scalars(
        select(CustomerPayment)
        .where(CustomerPayment.id == payment_id)
        .options(selectinload(CustomerPayment.client), selectinload(CustomerPayment.allocations), selectinload(CustomerPayment.documents), selectinload(CustomerPayment.notes_history))
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi.")
    return payment


def invoice_summary(invoice: CustomerInvoice) -> InvoiceSummary:
    return InvoiceSummary(subtotal_amount=invoice.subtotal_amount, vat_amount=invoice.vat_amount, total_amount=invoice.total_amount, paid_amount=invoice.paid_amount, remaining_amount=invoice.remaining_amount, items_count=len(invoice.items), allocations_count=len(invoice.allocations))


def payment_summary(payment: CustomerPayment) -> PaymentSummary:
    allocated = money(sum((allocation.allocated_amount for allocation in payment.allocations), Decimal("0")))
    return PaymentSummary(amount=payment.amount, allocated_amount=allocated, unallocated_amount=money(payment.amount - allocated), allocations_count=len(payment.allocations))


def validate_allocations(db: Session, payment: CustomerPayment, allocations: list[AllocationCreate], exclude_payment_id: int | None = None) -> None:
    total = money(sum((item.allocated_amount for item in allocations), Decimal("0")))
    if total > payment.amount:
        raise HTTPException(status_code=422, detail="Taqsimlangan summa to'lov summasidan oshmasligi kerak.")
    for item in allocations:
        invoice = load_invoice(db, item.invoice_id)
        if invoice.client_id != payment.client_id:
            raise HTTPException(status_code=422, detail="To'lov va hisob-faktura bir xil mijozga tegishli bo'lishi kerak.")
        current_from_payment = sum((a.allocated_amount for a in invoice.allocations if exclude_payment_id and a.payment_id == exclude_payment_id), Decimal("0"))
        available = money(invoice.remaining_amount + current_from_payment)
        if item.allocated_amount > available:
            raise HTTPException(status_code=422, detail="Taqsimlangan summa hisob-fakturaning qolgan summasidan oshmasligi kerak.")


def sync_orders_for_invoices(db: Session, invoices: list[CustomerInvoice]) -> None:
    order_ids = {invoice.order_id for invoice in invoices if invoice and invoice.order_id}
    for order_id in order_ids:
        order = db.get(Order, order_id)
        if order:
            sync_order_status(order, db=db)
    sync_contracts_for_invoices(db, invoices)


@invoice_router.get("", response_model=Page[InvoiceListItem])
def list_invoices(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    invoice_type: str | None = None,
    client_id: int | None = None,
    contract_id: int | None = None,
    order_id: int | None = None,
    delivery_batch_id: int | None = None,
):
    stmt = select(CustomerInvoice).join(Client).outerjoin(Contract).outerjoin(Order).outerjoin(DeliveryBatch).options(selectinload(CustomerInvoice.client), selectinload(CustomerInvoice.contract), selectinload(CustomerInvoice.order), selectinload(CustomerInvoice.delivery_batch)).distinct()
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(CustomerInvoice.invoice_number.ilike(value), Client.name.ilike(value), Client.inn.ilike(value), Contract.contract_number.ilike(value), Order.order_number.ilike(value), DeliveryBatch.batch_number.ilike(value)))
    if status_filter:
        filters.append(CustomerInvoice.status == status_filter)
    if invoice_type:
        filters.append(CustomerInvoice.invoice_type == invoice_type)
    if client_id:
        filters.append(CustomerInvoice.client_id == client_id)
    if contract_id:
        filters.append(CustomerInvoice.contract_id == contract_id)
    if order_id:
        filters.append(CustomerInvoice.order_id == order_id)
    if delivery_batch_id:
        filters.append(CustomerInvoice.delivery_batch_id == delivery_batch_id)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(CustomerInvoice.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=list(items), total=total, page=page, page_size=page_size)


def ensure_not_over_billing(db: Session, invoice: CustomerInvoice) -> None:
    """Refuse an invoice that would bill the contract for more than it is worth.

    The advance is raised against the contract and carries no order id, so the
    per-order arithmetic that filled in batch invoices never saw it and every
    batch was billed in full. The advance was then charged a second time --
    2 106 720 000 so'm on one contract.

    Adjustment invoices are exempt: correcting a figure is exactly what they are
    for, and a correction can legitimately push the total either way.
    """
    from backend.app.models.order import Order, OrderStatus
    from backend.app.services import contract_billing

    if invoice.contract_id is None or invoice.invoice_type is InvoiceType.adjustment:
        return
    order_totals = db.scalars(
        select(Order.total_amount).where(
            Order.contract_id == invoice.contract_id,
            Order.status != OrderStatus.cancelled,
        )
    ).all()
    invoices = db.scalars(
        select(CustomerInvoice).where(
            CustomerInvoice.contract_id == invoice.contract_id,
            CustomerInvoice.status != InvoiceStatus.cancelled,
        )
    ).all()
    position = contract_billing.build_position(
        order_totals=list(order_totals),
        invoices=[
            {"type": i.invoice_type.value, "amount": i.total_amount, "paid_amount": i.paid_amount}
            for i in invoices
        ],
    )
    if position.over_billed <= 0:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"Bu hisob-faktura bilan shartnoma bo'yicha jami hisob "
            f"{contract_billing.money_text(position.over_billed)} so'mga oshib ketadi. "
            "Avans allaqachon hisob qilingan bo'lsa, uni partiya hisobidan chegiring."
        ),
    )



@invoice_router.post("", response_model=InvoiceDetail, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def create_invoice(payload: InvoiceCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"items", "documents", "initial_note"})
    invoice = CustomerInvoice(**data)
    validate_invoice_links(db, invoice)
    db.add(invoice)
    db.flush()
    for item_payload in payload.items:
        item = CustomerInvoiceItem(invoice_id=invoice.id, **item_payload.model_dump())
        calculate_item(item)
        db.add(item)
    for document_payload in payload.documents:
        doc_data = document_payload.model_dump()
        doc_data["client_id"] = doc_data.get("client_id") or invoice.client_id
        doc_data["contract_id"] = doc_data.get("contract_id") or invoice.contract_id
        doc_data["invoice_id"] = invoice.id
        db.add(FinanceDocument(**doc_data))
    if payload.initial_note:
        note_data = payload.initial_note.model_dump()
        note_data["client_id"] = note_data.get("client_id") or invoice.client_id
        note_data["contract_id"] = note_data.get("contract_id") or invoice.contract_id
        note_data["invoice_id"] = invoice.id
        db.add(FinanceNote(**note_data))
    db.flush()
    db.refresh(invoice)
    recalculate_invoice(db, invoice)
    ensure_not_over_billing(db, invoice)
    sync_orders_for_invoices(db, [invoice])
    db.commit()
    return get_invoice_detail(invoice.id, db)


@invoice_router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice_detail(invoice_id: int, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    result = InvoiceDetail.model_validate(invoice)
    return result.model_copy(update={"summary": invoice_summary(invoice)})


@invoice_router.patch("/{invoice_id}", response_model=InvoiceDetail, dependencies=[Depends(require_edit("moliya"))])
def update_invoice(invoice_id: int, payload: InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    old_contract_id = invoice.contract_id
    old_order_id = invoice.order_id
    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    update_model(invoice, data)
    validate_invoice_links(db, invoice)
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=422, detail="Hisob-fakturada kamida bitta band bo'lishi kerak.")
        invoice.items.clear()
        db.flush()
        for item_payload in payload.items:
            item = CustomerInvoiceItem(invoice_id=invoice.id, **item_payload.model_dump())
            calculate_item(item)
            invoice.items.append(item)
    recalculate_invoice(db, invoice)
    sync_orders_for_invoices(db, [invoice])
    if old_order_id and old_order_id != invoice.order_id:
        old_order = db.get(Order, old_order_id)
        if old_order:
            sync_order_status(old_order, db=db)
    if old_contract_id and old_contract_id != invoice.contract_id:
        sync_contract_status(db, old_contract_id)
    db.commit()
    return get_invoice_detail(invoice.id, db)


@invoice_router.delete("/{invoice_id}", status_code=204, dependencies=[Depends(require_edit("moliya"))])
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = load_invoice(db, invoice_id)
    order_id = invoice.order_id
    contract_id = invoice.contract_id
    db.delete(invoice)
    db.flush()
    if order_id:
        order = db.get(Order, order_id)
        if order:
            sync_order_status(order, db=db)
    if contract_id:
        sync_contract_status(db, contract_id)
    db.commit()
    return Response(status_code=204)


@payment_router.get("", response_model=Page[PaymentListItem])
def list_payments(db: Session = Depends(get_db), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), search: str | None = None, status_filter: str | None = Query(None, alias="status")):
    stmt = select(CustomerPayment).join(Client).options(selectinload(CustomerPayment.client), selectinload(CustomerPayment.allocations)).distinct()
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(CustomerPayment.payment_number.ilike(value), Client.name.ilike(value), Client.inn.ilike(value), CustomerPayment.reference_number.ilike(value), CustomerPayment.bank_account.ilike(value)))
    if status_filter:
        filters.append(CustomerPayment.status == status_filter)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(CustomerPayment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    items = []
    for payment in rows:
        summary = payment_summary(payment)
        items.append(PaymentListItem(**PaymentRead.model_validate(payment).model_dump(), client=payment.client, allocated_amount=summary.allocated_amount, unallocated_amount=summary.unallocated_amount))
    return Page(items=items, total=total, page=page, page_size=page_size)


@payment_router.post("", response_model=PaymentDetail, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def create_payment(payload: PaymentCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"allocations", "documents", "initial_note"})
    payment = CustomerPayment(**data)
    if not db.get(Client, payment.client_id):
        raise HTTPException(status_code=400, detail="Mijoz mavjud emas.")
    db.add(payment)
    db.flush()
    validate_allocations(db, payment, payload.allocations)
    for allocation_payload in payload.allocations:
        db.add(PaymentAllocation(payment_id=payment.id, **allocation_payload.model_dump()))
    for document_payload in payload.documents:
        doc_data = document_payload.model_dump()
        doc_data["client_id"] = doc_data.get("client_id") or payment.client_id
        doc_data["payment_id"] = payment.id
        db.add(FinanceDocument(**doc_data))
    if payload.initial_note:
        note_data = payload.initial_note.model_dump()
        note_data["client_id"] = note_data.get("client_id") or payment.client_id
        note_data["payment_id"] = payment.id
        db.add(FinanceNote(**note_data))
    db.flush()
    db.refresh(payment)
    for allocation in payment.allocations:
        recalculate_invoice(db, allocation.invoice)
    sync_orders_for_invoices(db, [allocation.invoice for allocation in payment.allocations])
    recalculate_payment(db, payment)
    db.commit()
    return get_payment_detail(payment.id, db)


@payment_router.get("/{payment_id}", response_model=PaymentDetail)
def get_payment_detail(payment_id: int, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    result = PaymentDetail.model_validate(payment)
    return result.model_copy(update={"summary": payment_summary(payment)})


@payment_router.patch("/{payment_id}", response_model=PaymentDetail, dependencies=[Depends(require_edit("moliya"))])
def update_payment(payment_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    data = payload.model_dump(exclude_unset=True, exclude={"allocations"})
    update_model(payment, data)
    affected = []
    if payload.allocations is not None:
        validate_allocations(db, payment, payload.allocations, exclude_payment_id=payment.id)
        affected = [allocation.invoice for allocation in payment.allocations]
        payment.allocations.clear()
        db.flush()
        for allocation_payload in payload.allocations:
            payment.allocations.append(PaymentAllocation(payment_id=payment.id, **allocation_payload.model_dump()))
        for invoice in affected:
            recalculate_invoice(db, invoice)
    db.flush()
    for allocation in payment.allocations:
        recalculate_invoice(db, allocation.invoice)
    sync_orders_for_invoices(db, affected + [allocation.invoice for allocation in payment.allocations])
    recalculate_payment(db, payment)
    db.commit()
    return get_payment_detail(payment.id, db)


@payment_router.delete("/{payment_id}", status_code=204, dependencies=[Depends(require_edit("moliya"))])
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    invoices = [allocation.invoice for allocation in payment.allocations]
    db.delete(payment)
    db.flush()
    for invoice in invoices:
        recalculate_invoice(db, invoice)
    sync_orders_for_invoices(db, invoices)
    db.commit()
    return Response(status_code=204)


@payment_router.post("/{payment_id}/allocations", response_model=AllocationRead, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def create_allocation(payment_id: int, payload: AllocationCreate, db: Session = Depends(get_db)):
    payment = load_payment(db, payment_id)
    validate_allocations(db, payment, [payload])
    allocation = PaymentAllocation(payment_id=payment.id, **payload.model_dump())
    db.add(allocation)
    db.flush()
    recalculate_invoice(db, allocation.invoice)
    recalculate_payment(db, payment)
    sync_orders_for_invoices(db, [allocation.invoice])
    db.commit()
    db.refresh(allocation)
    return allocation


@finance_router.post("/documents", response_model=FinanceDocumentRead, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def create_document(payload: FinanceDocumentCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("client_id"):
        invoice = db.get(CustomerInvoice, data.get("invoice_id")) if data.get("invoice_id") else None
        payment = db.get(CustomerPayment, data.get("payment_id")) if data.get("payment_id") else None
        data["client_id"] = invoice.client_id if invoice else payment.client_id if payment else None
    if not data.get("client_id"):
        raise HTTPException(status_code=422, detail="client_id majburiy.")
    document = FinanceDocument(**data)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@finance_router.post("/documents/upload", response_model=FinanceDocumentRead, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def upload_document(
    document_type: FinanceDocumentType = Form(...),
    title: str = Form(...),
    client_id: int | None = Form(None),
    contract_id: int | None = Form(None),
    invoice_id: int | None = Form(None),
    payment_id: int | None = Form(None),
    uploaded_by: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=422, detail="Fayl majburiy.")
    invoice = db.get(CustomerInvoice, invoice_id) if invoice_id else None
    payment = db.get(CustomerPayment, payment_id) if payment_id else None
    resolved_client_id = client_id or (invoice.client_id if invoice else payment.client_id if payment else None)
    resolved_contract_id = contract_id or (invoice.contract_id if invoice else None)
    if not resolved_client_id:
        raise HTTPException(status_code=422, detail="client_id majburiy.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    with destination.open("wb") as buffer:
        copyfileobj(file.file, buffer)
    document = FinanceDocument(
        client_id=resolved_client_id,
        contract_id=resolved_contract_id,
        invoice_id=invoice_id,
        payment_id=payment_id,
        document_type=document_type,
        title=title,
        file_url=f"/static/uploads/finance/{stored_name}",
        uploaded_by=uploaded_by,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@finance_router.post("/notes", response_model=FinanceNoteRead, status_code=201, dependencies=[Depends(require_edit("moliya"))])
def create_note(payload: FinanceNoteCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("client_id"):
        invoice = db.get(CustomerInvoice, data.get("invoice_id")) if data.get("invoice_id") else None
        payment = db.get(CustomerPayment, data.get("payment_id")) if data.get("payment_id") else None
        data["client_id"] = invoice.client_id if invoice else payment.client_id if payment else None
    if not data.get("client_id"):
        raise HTTPException(status_code=422, detail="client_id majburiy.")
    note = FinanceNote(**data)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
