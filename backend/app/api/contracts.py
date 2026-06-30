from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.core.paths import UPLOADS_DIR
from backend.app.models.client import Client
from backend.app.models.contract import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractItem,
    ContractNote,
    ContractPaymentTerms,
    ContractTransportTerms,
)
from backend.app.models.delivery import BatchStatus, DeliveryBatch, DeliveryBatchItem, Logistics
from backend.app.models.finance import CustomerInvoice, InvoiceStatus
from backend.app.schemas.client import Page
from backend.app.schemas.contract import (
    ContractCreate,
    ContractDetail,
    ContractDocumentCreate,
    ContractDocumentRead,
    ContractDocumentUpdate,
    ContractItemCreate,
    ContractItemRead,
    ContractItemUpdate,
    ContractListItem,
    ContractNoteCreate,
    ContractNoteRead,
    ContractNoteUpdate,
    ContractPaymentTermsCreate,
    ContractPaymentTermsRead,
    ContractPaymentTermsUpdate,
    ContractRead,
    ContractSummary,
    ContractTransportTermsCreate,
    ContractTransportTermsRead,
    ContractTransportTermsUpdate,
    ContractUpdate,
)


router = APIRouter(prefix="/api/contracts", tags=["contracts"])
MONEY = Decimal("0.01")
QTY = Decimal("0.001")
UPLOAD_DIR = UPLOADS_DIR / "contracts"


def money(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(QTY, rounding=ROUND_HALF_UP)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def store_contract_upload(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File is required")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    with destination.open("wb") as buffer:
        copyfileobj(file.file, buffer)
    return f"/static/uploads/contracts/{stored_name}"


def get_contract_or_404(db: Session, contract_id: int) -> Contract:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    return contract


def get_child_or_404(db: Session, model: Any, contract_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.contract_id != contract_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


def ensure_client_exists(db: Session, client_id: int) -> None:
    if not db.get(Client, client_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client does not exist")


def calculate_item(item: ContractItem) -> None:
    item.subtotal = money(item.quantity * item.unit_price)
    item.vat_amount = money(item.subtotal * item.vat_rate / Decimal("100"))
    item.total_with_vat = money(item.subtotal + item.vat_amount)


def recalculate_contract(db: Session, contract: Contract) -> None:
    for item in contract.items:
        calculate_item(item)
    contract.subtotal_amount = money(sum((item.subtotal for item in contract.items), Decimal("0")))
    contract.vat_amount = money(sum((item.vat_amount for item in contract.items), Decimal("0")))
    contract.total_amount = money(sum((item.total_with_vat for item in contract.items), Decimal("0")))
    if contract.payment_terms:
        contract.payment_terms.remaining_percent = money(Decimal("100") - contract.payment_terms.advance_percent)
        contract.payment_terms.advance_amount = money(contract.total_amount * contract.payment_terms.advance_percent / Decimal("100"))
    db.flush()


def create_default_payment_terms(contract_id: int, payload: ContractPaymentTermsCreate | None = None) -> ContractPaymentTerms:
    data = payload.model_dump() if payload else ContractPaymentTermsCreate().model_dump()
    return ContractPaymentTerms(contract_id=contract_id, **data)


def create_default_transport_terms(
    contract_id: int, payload: ContractTransportTermsCreate | None = None
) -> ContractTransportTerms:
    data = payload.model_dump() if payload else ContractTransportTermsCreate().model_dump()
    return ContractTransportTerms(contract_id=contract_id, **data)


def delivered_quantity_for_contract(db: Session, contract_id: int) -> Decimal:
    delivered = db.scalar(
        select(func.coalesce(func.sum(DeliveryBatchItem.accepted_quantity), 0))
        .join(DeliveryBatch)
        .where(
            DeliveryBatch.contract_id == contract_id,
            DeliveryBatch.status != BatchStatus.cancelled,
        )
    )
    return qty(delivered or Decimal("0"))


def transport_expense_for_contract(db: Session, contract_id: int) -> Decimal:
    amount = db.scalar(
        select(func.coalesce(func.sum(Logistics.cost_amount), 0))
        .join(DeliveryBatch)
        .where(
            DeliveryBatch.contract_id == contract_id,
            DeliveryBatch.status != BatchStatus.cancelled,
        )
    )
    return money(amount or Decimal("0"))


def customer_invoice_totals_for_contract(db: Session, contract_id: int) -> tuple[Decimal, Decimal]:
    row = db.execute(
        select(
            func.coalesce(func.sum(CustomerInvoice.paid_amount), 0),
            func.coalesce(func.sum(CustomerInvoice.remaining_amount), 0),
        ).where(
            CustomerInvoice.contract_id == contract_id,
            CustomerInvoice.status != InvoiceStatus.cancelled,
        )
    ).one()
    return money(row[0] or Decimal("0")), money(row[1] or Decimal("0"))


def summary_for(db: Session, contract: Contract) -> ContractSummary:
    total_quantity = qty(sum((item.quantity for item in contract.items), Decimal("0")))
    delivered_quantity = delivered_quantity_for_contract(db, contract.id)
    advance_amount = money(contract.payment_terms.advance_amount if contract.payment_terms else Decimal("0"))
    remaining_amount = money(contract.total_amount - advance_amount)
    paid_amount, unpaid_amount = customer_invoice_totals_for_contract(db, contract.id)
    return ContractSummary(
        subtotal_amount=money(contract.subtotal_amount),
        vat_amount=money(contract.vat_amount),
        total_amount=money(contract.total_amount),
        total_quantity=total_quantity,
        advance_amount=advance_amount,
        remaining_amount=remaining_amount,
        items_count=len(contract.items),
        delivered_quantity=delivered_quantity,
        remaining_quantity=qty(total_quantity - delivered_quantity),
        paid_amount=paid_amount,
        unpaid_amount=unpaid_amount,
        transport_expense_total=transport_expense_for_contract(db, contract.id),
    )


def serialize_list_item(db: Session, contract: Contract) -> ContractListItem:
    total_quantity = qty(sum((item.quantity for item in contract.items), Decimal("0")))
    delivered_quantity = delivered_quantity_for_contract(db, contract.id)
    return ContractListItem(
        id=contract.id,
        client_id=contract.client_id,
        contract_number=contract.contract_number,
        contract_date=contract.contract_date,
        valid_until=contract.valid_until,
        title=contract.title,
        status=contract.status,
        currency=contract.currency,
        subtotal_amount=money(contract.subtotal_amount),
        vat_amount=money(contract.vat_amount),
        total_amount=money(contract.total_amount),
        notes=contract.notes,
        created_by=contract.created_by,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        client=contract.client,
        product=contract.items[0].product_name if contract.items else None,
        total_quantity=total_quantity,
        delivered_quantity=delivered_quantity,
        remaining_quantity=qty(total_quantity - delivered_quantity),
        last_activity=None,
    )


def load_contract_detail(db: Session, contract_id: int) -> Contract:
    contract = db.scalars(
        select(Contract)
        .where(Contract.id == contract_id)
        .options(
            selectinload(Contract.client),
            selectinload(Contract.items),
            selectinload(Contract.payment_terms),
            selectinload(Contract.transport_terms),
            selectinload(Contract.documents),
            selectinload(Contract.notes_history),
        )
    ).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    return contract


@router.get("", response_model=Page[ContractListItem])
def list_contracts(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    contract_number: str | None = None,
    client_name: str | None = None,
    inn: str | None = None,
    product_name: str | None = None,
    contract_date: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    valid_from: str | None = None,
    valid_to: str | None = None,
):
    stmt = (
        select(Contract)
        .join(Client)
        .outerjoin(ContractItem)
        .options(selectinload(Contract.client), selectinload(Contract.items))
        .distinct()
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                Contract.contract_number.ilike(value),
                Client.name.ilike(value),
                Client.inn.ilike(value),
                ContractItem.product_name.ilike(value),
                func.cast(Contract.contract_date, String).ilike(value),
            )
        )
    if contract_number:
        filters.append(Contract.contract_number.ilike(f"%{contract_number}%"))
    if client_name:
        filters.append(Client.name.ilike(f"%{client_name}%"))
    if inn:
        filters.append(Client.inn.ilike(f"%{inn}%"))
    if product_name:
        filters.append(ContractItem.product_name.ilike(f"%{product_name}%"))
    if contract_date:
        filters.append(func.cast(Contract.contract_date, String).ilike(f"%{contract_date}%"))
    if status_filter:
        filters.append(Contract.status == status_filter)
    if client_id:
        filters.append(Contract.client_id == client_id)
    if date_from:
        filters.append(Contract.contract_date >= date_from)
    if date_to:
        filters.append(Contract.contract_date <= date_to)
    if valid_from:
        filters.append(Contract.valid_until >= valid_from)
    if valid_to:
        filters.append(Contract.valid_until <= valid_to)
    if filters:
        stmt = stmt.where(*filters)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    contracts = db.scalars(
        stmt.order_by(Contract.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).unique()
    return Page(items=[serialize_list_item(db, contract) for contract in contracts], total=total, page=page, page_size=page_size)


@router.post("", response_model=ContractDetail, status_code=status.HTTP_201_CREATED)
def create_contract(payload: ContractCreate, db: Session = Depends(get_db)):
    ensure_client_exists(db, payload.client_id)
    data = payload.model_dump(exclude={"items", "payment_terms", "transport_terms", "documents", "initial_note"})
    contract = Contract(**data)
    db.add(contract)
    db.flush()
    for item_payload in payload.items:
        item = ContractItem(contract_id=contract.id, **item_payload.model_dump())
        calculate_item(item)
        db.add(item)
    db.flush()
    db.add(create_default_payment_terms(contract.id, payload.payment_terms))
    db.add(create_default_transport_terms(contract.id, payload.transport_terms))
    for document_payload in payload.documents:
        db.add(ContractDocument(contract_id=contract.id, **document_payload.model_dump()))
    if payload.initial_note:
        db.add(ContractNote(contract_id=contract.id, **payload.initial_note.model_dump()))
    db.flush()
    db.refresh(contract)
    recalculate_contract(db, contract)
    db.commit()
    return get_contract_detail(contract.id, db)


@router.get("/{contract_id}", response_model=ContractDetail)
def get_contract_detail(contract_id: int, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    return ContractDetail.model_validate(contract).model_copy(update={"summary": summary_for(db, contract)})


@router.patch("/{contract_id}", response_model=ContractDetail)
def update_contract(contract_id: int, payload: ContractUpdate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    data = payload.model_dump(exclude_unset=True, exclude={"items", "payment_terms", "transport_terms"})
    if "client_id" in data:
        ensure_client_exists(db, data["client_id"])
    update_model(contract, data)
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Contract must have at least one item")
        contract.items.clear()
        db.flush()
        for item_payload in payload.items:
            item = ContractItem(contract_id=contract.id, **item_payload.model_dump())
            calculate_item(item)
            contract.items.append(item)
    if payload.payment_terms is not None:
        if contract.payment_terms:
            update_model(contract.payment_terms, payload.payment_terms.model_dump())
        else:
            contract.payment_terms = create_default_payment_terms(contract.id, payload.payment_terms)
    if payload.transport_terms is not None:
        if contract.transport_terms:
            update_model(contract.transport_terms, payload.transport_terms.model_dump())
        else:
            contract.transport_terms = create_default_transport_terms(contract.id, payload.transport_terms)
    recalculate_contract(db, contract)
    db.commit()
    return get_contract_detail(contract.id, db)


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    db.delete(contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{contract_id}/items", response_model=ContractItemRead, status_code=status.HTTP_201_CREATED)
def create_item(contract_id: int, payload: ContractItemCreate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    item = ContractItem(contract_id=contract_id, **payload.model_dump())
    calculate_item(item)
    db.add(item)
    db.flush()
    db.refresh(contract)
    recalculate_contract(db, contract)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{contract_id}/items/{item_id}", response_model=ContractItemRead)
def update_item(contract_id: int, item_id: int, payload: ContractItemUpdate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    item = get_child_or_404(db, ContractItem, contract_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    calculate_item(item)
    recalculate_contract(db, contract)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{contract_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(contract_id: int, item_id: int, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    if len(contract.items) <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Contract must have at least one item")
    item = get_child_or_404(db, ContractItem, contract_id, item_id)
    db.delete(item)
    db.flush()
    db.refresh(contract)
    recalculate_contract(db, contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{contract_id}/payment-terms", response_model=ContractPaymentTermsRead)
def upsert_payment_terms(contract_id: int, payload: ContractPaymentTermsCreate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    if contract.payment_terms:
        update_model(contract.payment_terms, payload.model_dump())
    else:
        contract.payment_terms = create_default_payment_terms(contract_id, payload)
    recalculate_contract(db, contract)
    db.commit()
    db.refresh(contract.payment_terms)
    return contract.payment_terms


@router.patch("/{contract_id}/payment-terms", response_model=ContractPaymentTermsRead)
def update_payment_terms(contract_id: int, payload: ContractPaymentTermsUpdate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    if not contract.payment_terms:
        contract.payment_terms = create_default_payment_terms(contract_id)
    update_model(contract.payment_terms, payload.model_dump(exclude_unset=True))
    recalculate_contract(db, contract)
    db.commit()
    db.refresh(contract.payment_terms)
    return contract.payment_terms


@router.put("/{contract_id}/transport-terms", response_model=ContractTransportTermsRead)
def upsert_transport_terms(contract_id: int, payload: ContractTransportTermsCreate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    if contract.transport_terms:
        update_model(contract.transport_terms, payload.model_dump())
    else:
        contract.transport_terms = create_default_transport_terms(contract_id, payload)
    db.commit()
    db.refresh(contract.transport_terms)
    return contract.transport_terms


@router.patch("/{contract_id}/transport-terms", response_model=ContractTransportTermsRead)
def update_transport_terms(contract_id: int, payload: ContractTransportTermsUpdate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    if not contract.transport_terms:
        contract.transport_terms = create_default_transport_terms(contract_id)
    update_model(contract.transport_terms, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(contract.transport_terms)
    return contract.transport_terms


@router.post("/{contract_id}/documents", response_model=ContractDocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(contract_id: int, payload: ContractDocumentCreate, db: Session = Depends(get_db)):
    get_contract_or_404(db, contract_id)
    document = ContractDocument(contract_id=contract_id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.post("/{contract_id}/documents/upload", response_model=ContractDocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    contract_id: int,
    document_type: ContractDocumentType = Form(...),
    title: str = Form(...),
    uploaded_by: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    get_contract_or_404(db, contract_id)
    document = ContractDocument(
        contract_id=contract_id,
        document_type=document_type,
        title=title,
        file_url=store_contract_upload(file),
        uploaded_by=uploaded_by,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{contract_id}/documents/{document_id}/upload", response_model=ContractDocumentRead)
def replace_document_file(
    contract_id: int,
    document_id: int,
    document_type: ContractDocumentType = Form(...),
    title: str = Form(...),
    uploaded_by: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    document = get_child_or_404(db, ContractDocument, contract_id, document_id)
    document.document_type = document_type
    document.title = title
    document.uploaded_by = uploaded_by
    if file and file.filename:
        document.file_url = store_contract_upload(file)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{contract_id}/documents/{document_id}", response_model=ContractDocumentRead)
def update_document(contract_id: int, document_id: int, payload: ContractDocumentUpdate, db: Session = Depends(get_db)):
    document = get_child_or_404(db, ContractDocument, contract_id, document_id)
    update_model(document, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{contract_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(contract_id: int, document_id: int, db: Session = Depends(get_db)):
    document = get_child_or_404(db, ContractDocument, contract_id, document_id)
    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{contract_id}/notes", response_model=ContractNoteRead, status_code=status.HTTP_201_CREATED)
def create_note(contract_id: int, payload: ContractNoteCreate, db: Session = Depends(get_db)):
    get_contract_or_404(db, contract_id)
    note = ContractNote(contract_id=contract_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{contract_id}/notes/{note_id}", response_model=ContractNoteRead)
def update_note(contract_id: int, note_id: int, payload: ContractNoteUpdate, db: Session = Depends(get_db)):
    note = get_child_or_404(db, ContractNote, contract_id, note_id)
    update_model(note, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{contract_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(contract_id: int, note_id: int, db: Session = Depends(get_db)):
    note = get_child_or_404(db, ContractNote, contract_id, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
