import json
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.core.paths import PROJECT_ROOT, UPLOADS_DIR
from backend.app.models.client import Client
from backend.app.models.contract import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractFile,
    ContractItem,
    ContractNote,
    ContractPaymentTerms,
    ContractParseSession,
    ContractParseSessionStatus,
    ContractStatus,
    ContractTransportTerms,
)
from backend.app.models.customer_request import CustomerRequest
from backend.app.models.delivery import BatchStatus, DeliveryBatch, DeliveryBatchItem, Logistics
from backend.app.models.order import Order, OrderItem
from backend.app.models.product import Product
from backend.app.models.finance import CustomerInvoice, InvoiceStatus
from backend.app.schemas.client import Page
from backend.app.schemas.contract import (
    ContractCreate,
    ContractDetail,
    ContractDocumentCreate,
    ContractDocumentRead,
    ContractDocumentUpdate,
    ContractFromParsedCreate,
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
    ParsedContractData,
)
from backend.app.services.client_matching import (
    create_client_from_registry,
    enrich_client_fields,
    find_client_by_inn,
    find_registry_by_inn,
)
from backend.app.services.contract_pdf_parser import PARSER_VERSION, parse_contract_pdf


router = APIRouter(prefix="/api/contracts", tags=["contracts"])
MONEY = Decimal("0.01")
QTY = Decimal("0.001")
UPLOAD_DIR = UPLOADS_DIR / "contracts"
CONTRACT_STORAGE_DIR = PROJECT_ROOT / "backend" / "storage" / "contracts"
CONTRACT_ORIGINALS_DIR = CONTRACT_STORAGE_DIR / "originals"
CONTRACT_PARSED_TEXT_DIR = CONTRACT_STORAGE_DIR / "parsed_text"
MAX_CONTRACT_PDF_SIZE = 20 * 1024 * 1024


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


def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def safe_pdf_filename(filename: str) -> str:
    return f"{uuid4().hex}_{Path(filename).name.replace(' ', '_')}"


def store_original_pdf(file: UploadFile) -> tuple[Path, int]:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="PDF fayl majburiy.")
    if Path(file.filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Faqat PDF fayl qabul qilinadi.")
    CONTRACT_ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
    destination = CONTRACT_ORIGINALS_DIR / safe_pdf_filename(file.filename)
    size = 0
    with destination.open("wb") as buffer:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_CONTRACT_PDF_SIZE:
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Fayl hajmi 20 MB dan oshmasligi kerak.",
                )
            buffer.write(chunk)
    return destination, size


def write_parsed_text(text: str) -> Path:
    CONTRACT_PARSED_TEXT_DIR.mkdir(parents=True, exist_ok=True)
    path = CONTRACT_PARSED_TEXT_DIR / f"{uuid4().hex}.txt"
    path.write_text(text, encoding="utf-8")
    return path


def relative_storage_path(path: Path | str | None) -> str | None:
    if not path:
        return None
    try:
        return str(Path(path).resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def absolute_storage_path(path: str | None) -> Path | None:
    if not path:
        return None
    file_path = Path(path)
    if not file_path.is_absolute():
        file_path = PROJECT_ROOT / file_path
    return file_path


def flatten_parsed_result(result: dict) -> dict:
    customer = result.get("customer") or {}
    executor = result.get("executor") or {}
    totals = result.get("totals") or {}
    payment = result.get("payment_terms") or {}
    documents = result.get("document_ids") or {}
    return {
        "contract_number": result.get("contract_number"),
        "contract_date": result.get("contract_date"),
        "valid_until": result.get("valid_until"),
        "place": result.get("place"),
        "customer_name": customer.get("name"),
        "customer_director_full_name": customer.get("director_full_name"),
        "customer_inn": customer.get("inn"),
        "customer_oked": customer.get("oked"),
        "customer_legal_address": customer.get("legal_address"),
        "customer_bank_account": customer.get("bank_account"),
        "customer_bank_name": customer.get("bank_name"),
        "customer_mfo": customer.get("mfo"),
        "customer_phone": customer.get("phone"),
        "executor_name": executor.get("name"),
        "executor_director_full_name": executor.get("director_full_name"),
        "executor_inn": executor.get("inn"),
        "executor_oked": executor.get("oked"),
        "executor_legal_address": executor.get("legal_address"),
        "executor_bank_account": executor.get("bank_account"),
        "executor_bank_name": executor.get("bank_name"),
        "executor_mfo": executor.get("mfo"),
        "executor_phone": executor.get("phone"),
        "total_without_vat": totals.get("total_without_vat"),
        "vat_rate": totals.get("vat_rate"),
        "vat_amount": totals.get("vat_amount"),
        "total_with_vat": totals.get("total_with_vat"),
        "prepayment_percent": payment.get("prepayment_percent"),
        "prepayment_amount": payment.get("prepayment_amount"),
        "remaining_payment_percent": payment.get("remaining_payment_percent"),
        "payment_terms_text": payment.get("payment_terms_text"),
        "transport_cost_separate": result.get("transport_cost_separate") or False,
        "didox_id": documents.get("didox_id"),
        "rouming_id": documents.get("rouming_id"),
        "items": result.get("items") or [],
    }


def suggest_matches(db: Session, parsed: dict) -> dict:
    customer_inn = parsed.get("customer_inn")
    customer = db.scalars(select(Client).where(Client.inn == customer_inn)).first() if customer_inn else None
    products = []
    for item in parsed.get("items") or []:
        value = item.get("product_brand") or item.get("product_name")
        product = None
        if value:
            product = db.scalars(
                select(Product).where(Product.name.ilike(f"%{value}%"))
            ).first()
        products.append({"item_index": len(products), "product_id": product.id if product else None, "product_name": product.name if product else None})
    return {
        "customer": {"id": customer.id, "name": customer.name, "inn": customer.inn} if customer else None,
        "products": products,
    }


def ensure_optional_client_exists(db: Session, client_id: int | None) -> None:
    if client_id is not None:
        ensure_client_exists(db, client_id)


def ensure_customer_request_exists(db: Session, request_id: int | None) -> None:
    if request_id is not None and not db.get(CustomerRequest, request_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Talabnoma topilmadi.")


def parsed_item_to_contract_item(contract_id: int, item_payload) -> ContractItem:
    quantity = item_payload.quantity or Decimal("0")
    unit_price = item_payload.unit_price or Decimal("0")
    vat_rate = item_payload.vat_rate if item_payload.vat_rate is not None else Decimal("12")
    item = ContractItem(
        contract_id=contract_id,
        product_id=item_payload.product_id,
        product_name=item_payload.product_name or item_payload.product_brand or "Mahsulot",
        product_code=item_payload.catalog_code,
        product_brand=item_payload.product_brand,
        catalog_code=item_payload.catalog_code,
        barcode=item_payload.barcode,
        unit=item_payload.unit or "tonna",
        quantity=quantity,
        unit_price=unit_price,
        subtotal=item_payload.amount_without_vat or Decimal("0"),
        vat_rate=vat_rate,
        vat_amount=item_payload.vat_amount or Decimal("0"),
        total_with_vat=item_payload.amount_with_vat or Decimal("0"),
    )
    return item


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


def apply_product_fields(db: Session, item: ContractItem) -> None:
    if item.product_id is None:
        return
    product = db.get(Product, item.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Product {item.product_id} not found")
    item.product_name = product.name
    item.unit = product.unit


def recalculate_contract(db: Session, contract: Contract, recalc_items: bool = True) -> None:
    if recalc_items:
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


def delivered_quantities_batch(db: Session, contract_ids: list[int]) -> dict[int, Decimal]:
    if not contract_ids:
        return {}
    rows = db.execute(
        select(
            DeliveryBatch.contract_id,
            func.coalesce(func.sum(DeliveryBatchItem.accepted_quantity), 0).label("total"),
        )
        .join(DeliveryBatchItem, DeliveryBatch.id == DeliveryBatchItem.delivery_batch_id)
        .where(
            DeliveryBatch.contract_id.in_(contract_ids),
            DeliveryBatch.status != BatchStatus.cancelled,
        )
        .group_by(DeliveryBatch.contract_id)
    ).all()
    return {row.contract_id: qty(row.total) for row in rows}


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
    paid_amount, unpaid_amount = customer_invoice_totals_for_contract(db, contract.id)
    remaining_amount = money(contract.total_amount - paid_amount)
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


def serialize_list_item(contract: Contract, delivered_quantity: Decimal) -> ContractListItem:
    total_quantity = qty(sum((item.quantity for item in contract.items), Decimal("0")))
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


@router.post("/parse-pdf")
def parse_contract_pdf_endpoint(
    file: UploadFile = File(...),
    uploaded_by: str | None = Form(None),
    db: Session = Depends(get_db),
):
    stored_path, file_size = store_original_pdf(file)
    try:
        result = parse_contract_pdf(stored_path)
    except ValueError as exc:
        parsed_text_path = None
        session = ContractParseSession(
            original_filename=file.filename or "contract.pdf",
            file_path=relative_storage_path(stored_path) or str(stored_path),
            parsed_text_path=parsed_text_path,
            parsed_data_json=json.dumps({}, ensure_ascii=False),
            warnings_json=json.dumps([str(exc)], ensure_ascii=False),
            confidence=Decimal("0"),
            status=ContractParseSessionStatus.failed,
            created_by=uploaded_by,
        )
        db.add(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    parsed_text_path = write_parsed_text(result.raw_text)
    result_dict = result.to_dict()
    parsed = flatten_parsed_result(result_dict)
    parsed["status"] = "active"
    session = ContractParseSession(
        original_filename=file.filename or "contract.pdf",
        file_path=relative_storage_path(stored_path) or str(stored_path),
        parsed_text_path=relative_storage_path(parsed_text_path),
        parsed_data_json=json.dumps(parsed, ensure_ascii=False, default=json_default),
        warnings_json=json.dumps(result.warnings, ensure_ascii=False),
        confidence=result.confidence,
        status=ContractParseSessionStatus.parsed,
        created_by=uploaded_by,
    )
    db.add(session)
    db.flush()
    db.add(
        ContractFile(
            parse_session_id=session.id,
            original_filename=file.filename or "contract.pdf",
            file_path=relative_storage_path(stored_path) or str(stored_path),
            file_type="application/pdf",
            file_size=file_size,
            uploaded_by=uploaded_by,
        )
    )
    db.commit()
    return {
        "success": True,
        "data": {
            "parse_session_id": session.id,
            "confidence": float(result.confidence),
            "warnings": result.warnings,
            "parsed": parsed,
            "suggestions": suggest_matches(db, parsed),
            "file_url": f"/api/contracts/parse-sessions/{session.id}/file",
        },
    }


@router.get("/parse-sessions/{session_id}/file")
def get_parse_session_file(session_id: int, db: Session = Depends(get_db)):
    session = db.get(ContractParseSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tahlil sessiyasi topilmadi.")
    path = absolute_storage_path(session.file_path)
    if not path or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF fayl topilmadi.")
    return FileResponse(path, media_type="application/pdf", filename=session.original_filename)


@router.post("/from-parsed", response_model=ContractDetail, status_code=status.HTTP_201_CREATED)
def create_contract_from_parsed(payload: ContractFromParsedCreate, db: Session = Depends(get_db)):
    session = db.get(ContractParseSession, payload.parse_session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tahlil sessiyasi topilmadi.")
    if session.status == ContractParseSessionStatus.confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bu PDF bo'yicha shartnoma allaqachon yaratilgan.")
    if not payload.contract_number:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Shartnoma raqami majburiy.")
    if not payload.contract_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Shartnoma sanasi majburiy.")
    if not payload.customer_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Buyurtmachi nomi majburiy.")
    if not payload.customer_inn:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Buyurtmachi STIR majburiy.")
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Kamida bitta mahsulot bo‘lishi kerak.")
    ensure_optional_client_exists(db, payload.customer_id)
    ensure_customer_request_exists(db, payload.customer_request_id)
    warnings = json.loads(session.warnings_json or "[]")
    data = payload.model_dump(exclude={"items", "parse_session_id", "customer_id"})
    contract = Contract(
        client_id=payload.customer_id,
        contract_number=payload.contract_number,
        contract_date=payload.contract_date,
        valid_until=payload.valid_until or payload.contract_date,
        title=payload.customer_name,
        status=payload.status,
        currency="UZS",
        notes=payload.payment_terms_text,
        subtotal_amount=payload.total_without_vat or Decimal("0"),
        vat_amount=payload.vat_amount or Decimal("0"),
        total_amount=payload.total_with_vat or Decimal("0"),
        parser_version=PARSER_VERSION,
        parse_confidence=session.confidence,
        parse_warnings=json.dumps(warnings, ensure_ascii=False),
        source_file_path=session.file_path,
        original_filename=session.original_filename,
        parsed_text_path=session.parsed_text_path,
        **{
            k: v
            for k, v in data.items()
            if hasattr(Contract, k)
            and k
            not in {
                "contract_number",
                "contract_date",
                "valid_until",
                "status",
                "vat_amount",
                "total_without_vat",
                "total_with_vat",
                "prepayment_percent",
                "prepayment_amount",
                "remaining_payment_percent",
                "payment_terms_text",
                "transport_cost_separate",
            }
        },
    )
    db.add(contract)
    db.flush()
    for item_payload in payload.items:
        if not item_payload.quantity or item_payload.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Miqdor 0 dan katta bo‘lishi kerak.")
        if not item_payload.unit_price or item_payload.unit_price <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Birlik narxi 0 dan katta bo‘lishi kerak.")
        item = parsed_item_to_contract_item(contract.id, item_payload)
        apply_product_fields(db, item)
        if item.subtotal == 0 or item.vat_amount == 0 or item.total_with_vat == 0:
            calculate_item(item)
        db.add(item)
    db.flush()
    db.add(
        create_default_payment_terms(
            contract.id,
            ContractPaymentTermsCreate(
                advance_percent=payload.prepayment_percent or Decimal("30"),
                remaining_percent=payload.remaining_payment_percent or Decimal("70"),
                remaining_payment_rule=payload.payment_terms_text or "Qolgan to‘lov tayyor partiya bo‘yicha hisob-faktura asosida amalga oshiriladi.",
            ),
        )
    )
    db.add(
        create_default_transport_terms(
            contract.id,
            ContractTransportTermsCreate(
                transport_payment_type="separate_invoice" if payload.transport_cost_separate else "included",
                notes="Transport xarajati alohida hisoblanadi." if payload.transport_cost_separate else None,
            ),
        )
    )
    file_row = db.scalars(select(ContractFile).where(ContractFile.parse_session_id == session.id)).first()
    if file_row:
        file_row.contract_id = contract.id
        db.add(
            ContractDocument(
                contract_id=contract.id,
                document_type=ContractDocumentType.contract_pdf,
                title=session.original_filename,
                file_url=f"/api/contracts/{contract.id}/file",
                uploaded_by=session.created_by,
            )
        )
    session.status = ContractParseSessionStatus.confirmed
    session.created_contract_id = contract.id
    # Items already carry the PDF-parsed totals (or freshly calculated ones where
    # the parse didn't yield a total) via parsed_item_to_contract_item above, so
    # only re-sum the contract-level totals here instead of recalculating each
    # item from quantity * unit_price, which would silently discard the parsed
    # total whenever it legitimately differs (rounding, discounts, etc.).
    recalculate_contract(db, contract, recalc_items=False)
    db.commit()
    return get_contract_detail(contract.id, db)


@router.post("/{contract_id}/cancel", response_model=ContractDetail)
def cancel_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    contract.status = ContractStatus.cancelled
    db.commit()
    return get_contract_detail(contract.id, db)


@router.post("/{contract_id}/link-new-client", response_model=ContractDetail)
def link_contract_to_new_client(contract_id: int, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    if contract.client_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Shartnoma allaqachon mijozga bog'langan.")
    if not contract.customer_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Shartnomada buyurtmachi nomi yo'q.")

    client = find_client_by_inn(db, contract.customer_inn)
    if not client:
        registry = find_registry_by_inn(db, contract.customer_inn)
        if registry:
            client = create_client_from_registry(db, registry)
        else:
            client = Client(name=contract.customer_name, inn=contract.customer_inn, oked=contract.customer_oked, phone=contract.customer_phone)
            db.add(client)
            db.flush()
    # A matched/created client may still be missing fields this contract's own
    # snapshot has (e.g. registry has no phone, or an existing client predates
    # the registry import) — backfill from the contract as a second pass.
    enrich_client_fields(
        db,
        client,
        oked=contract.customer_oked,
        phone=contract.customer_phone,
        legal_address=contract.customer_legal_address,
        bank_name=contract.customer_bank_name,
        mfo=contract.customer_mfo,
        bank_account=contract.customer_bank_account,
        director_full_name=contract.customer_director_full_name,
    )
    contract.client_id = client.id
    db.commit()
    return get_contract_detail(contract.id, db)


@router.get("/{contract_id}/file")
def get_contract_file(contract_id: int, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    path = absolute_storage_path(contract.source_file_path)
    if not path or not path.exists():
        file_row = db.scalars(select(ContractFile).where(ContractFile.contract_id == contract_id)).first()
        path = absolute_storage_path(file_row.file_path) if file_row else None
    if not path or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF fayl topilmadi.")
    return FileResponse(path, media_type="application/pdf", filename=contract.original_filename or path.name)


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
        .outerjoin(Client)
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
                Contract.customer_name.ilike(value),
                Contract.customer_inn.ilike(value),
                Contract.didox_id.ilike(value),
                Contract.rouming_id.ilike(value),
                ContractItem.product_name.ilike(value),
                func.cast(Contract.contract_date, String).ilike(value),
            )
        )
    if contract_number:
        filters.append(Contract.contract_number.ilike(f"%{contract_number}%"))
    if client_name:
        filters.append(or_(Client.name.ilike(f"%{client_name}%"), Contract.customer_name.ilike(f"%{client_name}%")))
    if inn:
        filters.append(or_(Client.inn.ilike(f"%{inn}%"), Contract.customer_inn.ilike(f"%{inn}%")))
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
    contracts = list(db.scalars(
        stmt.order_by(Contract.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).unique())
    delivered_map = delivered_quantities_batch(db, [c.id for c in contracts])
    return Page(
        items=[serialize_list_item(c, delivered_map.get(c.id, Decimal("0"))) for c in contracts],
        total=total, page=page, page_size=page_size,
    )


def next_contract_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"BIT-{year}-"
    existing = db.scalars(
        select(Contract.contract_number).where(Contract.contract_number.like(f"{prefix}%"))
    ).all()
    max_seq = 0
    for value in existing:
        suffix = value[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:04d}"


@router.get("/next-number")
def get_next_contract_number(db: Session = Depends(get_db)):
    return {"contract_number": next_contract_number(db)}


@router.post("", response_model=ContractDetail, status_code=status.HTTP_201_CREATED)
def create_contract(payload: ContractCreate, db: Session = Depends(get_db)):
    ensure_optional_client_exists(db, payload.client_id)
    data = payload.model_dump(exclude={"items", "payment_terms", "transport_terms", "documents", "initial_note"})
    contract = Contract(**data)
    db.add(contract)
    db.flush()
    for item_payload in payload.items:
        item = ContractItem(contract_id=contract.id, **item_payload.model_dump())
        apply_product_fields(db, item)
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
        existing_item_ids = [item.id for item in contract.items]
        if existing_item_ids:
            referenced = db.scalar(
                select(func.count()).where(OrderItem.contract_item_id.in_(existing_item_ids))
            )
            if referenced:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cannot replace specification while orders reference it. Edit items individually via the Specification tab.",
                )
        contract.items.clear()
        db.flush()
        for item_payload in payload.items:
            item = ContractItem(contract_id=contract.id, **item_payload.model_dump())
            apply_product_fields(db, item)
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
    if db.scalar(select(func.count()).where(Order.contract_id == contract_id)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete a contract that has orders. Cancel or remove its orders first.",
        )
    if db.scalar(select(func.count()).where(DeliveryBatch.contract_id == contract_id)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete a contract that has delivery batches.",
        )
    if db.scalar(select(func.count()).where(CustomerInvoice.contract_id == contract_id)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete a contract that has customer invoices.",
        )
    db.delete(contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{contract_id}/items", response_model=ContractItemRead, status_code=status.HTTP_201_CREATED)
def create_item(contract_id: int, payload: ContractItemCreate, db: Session = Depends(get_db)):
    contract = load_contract_detail(db, contract_id)
    item = ContractItem(contract_id=contract_id, **payload.model_dump())
    apply_product_fields(db, item)
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
    apply_product_fields(db, item)
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
