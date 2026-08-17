from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.contract import Contract
from backend.app.models.customer_request import (
    CompanyRegistry,
    CustomerRequest,
    CustomerRequestSchedule,
    CustomerRequestStatus,
    CustomerRequestStatusHistory,
    CustomerType,
    PaymentSource,
)
from backend.app.models.product import Product
from backend.app.schemas.client import Page
from backend.app.schemas.customer_request import (
    CUSTOMER_TYPE_LABELS,
    PAYMENT_SOURCE_LABELS,
    REQUEST_STATUS_LABELS,
    CompanyRegistryRead,
    CustomerRequestCreate,
    CustomerRequestDetail,
    CustomerRequestListItem,
    CustomerRequestScheduleRead,
    CustomerRequestStatusChange,
    CustomerRequestStatusHistoryRead,
    CustomerRequestUpdate,
    ProductSummary,
    PublicProductRead,
)
from backend.app.services.auth import require_edit


router = APIRouter(prefix="/api/customer-requests", tags=["customer-requests"])
public_router = APIRouter(prefix="/api/public", tags=["public"])


def enum_label(mapping: dict, value) -> str:
    return mapping.get(value, str(value or ""))


def product_summary(product: Product | None) -> ProductSummary:
    if product is None:
        return ProductSummary(id=0, name="", product_type=None, brand=None, unit="")
    return ProductSummary(
        id=product.id,
        name=product.name,
        product_type=product.category.name if product.category else None,
        brand=product.name,
        unit=product.unit,
    )


def public_product(product: Product) -> PublicProductRead:
    return PublicProductRead(
        id=product.id,
        name=product.name,
        product_type=product.category.name if product.category else None,
        brand=product.name,
        unit=product.unit,
    )


def validate_schedule_total(total_quantity: Decimal, schedule_items) -> None:
    if not schedule_items:
        return
    schedule_total = sum((Decimal(str(item.quantity)) for item in schedule_items), Decimal("0"))
    if schedule_total != Decimal(str(total_quantity)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.",
        )


def next_request_number(db: Session) -> str:
    max_id = db.scalar(select(func.max(CustomerRequest.id))) or 0
    return f"REQ-{max_id + 1:06d}"


def get_request_or_404(db: Session, request_id: int) -> CustomerRequest:
    request = db.scalars(
        select(CustomerRequest)
        .where(CustomerRequest.id == request_id)
        .options(
            selectinload(CustomerRequest.product).selectinload(Product.category),
            selectinload(CustomerRequest.schedules),
            selectinload(CustomerRequest.status_history),
        )
    ).first()
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Talabnoma topilmadi.")
    return request


def add_status_history(
    db: Session,
    request: CustomerRequest,
    old_status: CustomerRequestStatus | None,
    new_status: CustomerRequestStatus,
    comment: str | None = None,
    changed_by: str | None = "operator",
) -> None:
    db.add(
        CustomerRequestStatusHistory(
            request_id=request.id,
            old_status=old_status,
            new_status=new_status,
            comment=comment,
            changed_by=changed_by,
        )
    )


def serialize_history(item: CustomerRequestStatusHistory) -> CustomerRequestStatusHistoryRead:
    return CustomerRequestStatusHistoryRead(
        id=item.id,
        old_status=item.old_status,
        old_status_label=enum_label(REQUEST_STATUS_LABELS, item.old_status) if item.old_status else None,
        new_status=item.new_status,
        new_status_label=enum_label(REQUEST_STATUS_LABELS, item.new_status),
        changed_by=item.changed_by,
        comment=item.comment,
        created_at=item.created_at,
    )


def serialize_list_item(request: CustomerRequest) -> CustomerRequestListItem:
    return CustomerRequestListItem(
        id=request.id,
        request_number=request.request_number,
        customer_type=request.customer_type,
        customer_type_label=enum_label(CUSTOMER_TYPE_LABELS, request.customer_type),
        payment_source=request.payment_source,
        payment_source_label=enum_label(PAYMENT_SOURCE_LABELS, request.payment_source),
        company_name=request.company_name,
        inn=request.inn,
        phone=request.phone,
        product=product_summary(request.product),
        total_quantity=request.total_quantity,
        unit=request.unit,
        status=request.status,
        status_label=enum_label(REQUEST_STATUS_LABELS, request.status),
        created_at=request.created_at,
    )


def serialize_detail(request: CustomerRequest) -> CustomerRequestDetail:
    base = serialize_list_item(request).model_dump()
    return CustomerRequestDetail(
        **base,
        region=request.region,
        activity_type=request.activity_type,
        function_description=request.function_description,
        privatization_project_name=request.privatization_project_name,
        oked=request.oked,
        director_full_name=request.director_full_name,
        legal_address=request.legal_address,
        bank_account=request.bank_account,
        bank_name=request.bank_name,
        mfo=request.mfo,
        contact_full_name=request.contact_full_name,
        contact_phone=request.contact_phone,
        internal_comment=request.internal_comment,
        rejection_reason=request.rejection_reason,
        reviewed_at=request.reviewed_at,
        contract_signed_at=request.contract_signed_at,
        converted_to_order_at=request.converted_to_order_at,
        updated_at=request.updated_at,
        schedule=[CustomerRequestScheduleRead.model_validate(item) for item in request.schedules],
        status_history=[serialize_history(item) for item in request.status_history],
    )


@public_router.get("/company-by-inn")
def get_company_by_inn(inn: str = Query(...), db: Session = Depends(get_db)):
    if not inn.isdigit():
        return {
            "success": False,
            "error": {
                "code": "INVALID_INN",
                "message": "STIR faqat raqamlardan iborat bo'lishi kerak.",
            },
        }
    company = db.scalars(select(CompanyRegistry).where(CompanyRegistry.inn == inn)).first()
    if not company:
        return {
            "success": False,
            "error": {
                "code": "COMPANY_NOT_FOUND",
                "message": "Ushbu STIR bo'yicha tashkilot topilmadi.",
            },
        }
    return {"success": True, "data": CompanyRegistryRead.model_validate(company).model_dump()}


@public_router.get("/products")
def list_public_products(db: Session = Depends(get_db)):
    products = db.scalars(select(Product).options(selectinload(Product.category)).order_by(Product.name)).all()
    return {"success": True, "data": [public_product(product).model_dump() for product in products]}


@public_router.post("/customer-requests", status_code=status.HTTP_201_CREATED)
def create_public_customer_request(payload: CustomerRequestCreate, db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mahsulot majburiy.")
    validate_schedule_total(payload.total_quantity, payload.schedule)
    data = payload.model_dump(exclude={"schedule"})
    data["phone"] = data.get("phone") or data.get("contact_phone") or ""
    request = CustomerRequest(
        request_number=next_request_number(db),
        **data,
    )
    db.add(request)
    db.flush()
    for item in payload.schedule:
        db.add(CustomerRequestSchedule(request_id=request.id, **item.model_dump()))
    add_status_history(db, request, None, CustomerRequestStatus.new, "Talabnoma yaratildi.", "public")
    db.commit()
    return {
        "success": True,
        "data": {
            "id": request.id,
            "request_number": request.request_number,
            "status": CustomerRequestStatus.new.value,
            "status_label": "Yangi",
            "message": "Talabnoma muvaffaqiyatli yuborildi.",
        },
    }


@router.get("", response_model=Page[CustomerRequestListItem])
def list_customer_requests(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: CustomerRequestStatus | None = Query(default=None, alias="status"),
    customer_type: CustomerType | None = None,
    payment_source: PaymentSource | None = None,
    product_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    stmt = select(CustomerRequest).options(
        selectinload(CustomerRequest.product).selectinload(Product.category),
        selectinload(CustomerRequest.schedules),
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                CustomerRequest.request_number.ilike(value),
                CustomerRequest.company_name.ilike(value),
                CustomerRequest.inn.ilike(value),
                CustomerRequest.phone.ilike(value),
                CustomerRequest.contact_full_name.ilike(value),
            )
        )
    if status_filter:
        filters.append(CustomerRequest.status == status_filter)
    if customer_type:
        filters.append(CustomerRequest.customer_type == customer_type)
    if payment_source:
        filters.append(CustomerRequest.payment_source == payment_source)
    if product_id:
        filters.append(CustomerRequest.product_id == product_id)
    if date_from:
        filters.append(CustomerRequest.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        filters.append(CustomerRequest.created_at <= datetime.fromisoformat(date_to))
    if filters:
        stmt = stmt.where(*filters)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(CustomerRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).unique()
    return Page(
        items=[serialize_list_item(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{request_id}", response_model=CustomerRequestDetail)
def get_customer_request(request_id: int, db: Session = Depends(get_db)):
    return serialize_detail(get_request_or_404(db, request_id))


@router.patch("/{request_id}", response_model=CustomerRequestDetail, dependencies=[Depends(require_edit("sotuv"))])
def update_customer_request(request_id: int, payload: CustomerRequestUpdate, db: Session = Depends(get_db)):
    request = get_request_or_404(db, request_id)
    if request.status == CustomerRequestStatus.converted_to_order:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Buyurtmaga o'tkazilgan talabnoma tahrirlanmaydi.")
    data = payload.model_dump(exclude_unset=True, exclude={"schedule"})
    if "product_id" in data and data["product_id"] is not None and not db.get(Product, data["product_id"]):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mahsulot majburiy.")
    next_total = data.get("total_quantity", request.total_quantity)
    if payload.schedule is not None:
        validate_schedule_total(next_total, payload.schedule)
        request.schedules.clear()
        db.flush()
        for item in payload.schedule:
            request.schedules.append(CustomerRequestSchedule(**item.model_dump()))
    elif "total_quantity" in data and request.schedules:
        validate_schedule_total(next_total, request.schedules)
    for key, value in data.items():
        setattr(request, key, value)
    db.commit()
    return serialize_detail(get_request_or_404(db, request_id))


@router.post("/{request_id}/status", response_model=CustomerRequestDetail, dependencies=[Depends(require_edit("sotuv"))])
def update_customer_request_status(
    request_id: int,
    payload: CustomerRequestStatusChange,
    db: Session = Depends(get_db),
):
    allowed_statuses = {
        CustomerRequestStatus.reviewing,
        CustomerRequestStatus.negotiation,
        CustomerRequestStatus.contract_preparation,
        CustomerRequestStatus.contract_signed,
        CustomerRequestStatus.rejected,
    }
    if payload.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Status qiymati noto'g'ri.")
    if payload.status == CustomerRequestStatus.rejected and not (payload.rejection_reason or payload.comment):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rad etish sababi majburiy.")
    request = get_request_or_404(db, request_id)
    old_status = request.status
    request.status = payload.status
    if payload.status == CustomerRequestStatus.reviewing and not request.reviewed_at:
        request.reviewed_at = datetime.utcnow()
    if payload.status == CustomerRequestStatus.contract_signed and not request.contract_signed_at:
        request.contract_signed_at = datetime.utcnow()
    if payload.status == CustomerRequestStatus.rejected:
        request.rejection_reason = payload.rejection_reason or payload.comment
    add_status_history(db, request, old_status, payload.status, payload.comment or payload.rejection_reason, payload.changed_by)
    db.commit()
    return serialize_detail(get_request_or_404(db, request_id))


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_customer_request(request_id: int, db: Session = Depends(get_db)):
    """Remove a talabnoma -- for the mistaken and the spam ones.

    Refused once a contract has been built from it: that contract points back
    here, and deleting the request would leave it pointing at nothing. Such a
    request should be cancelled by status, not erased.
    """
    request = get_request_or_404(db, request_id)
    contract = db.scalars(select(Contract).where(Contract.customer_request_id == request_id)).first()
    if contract:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu talabnoma asosida {contract.contract_number} shartnomasi tuzilgan, shuning uchun o'chirib bo'lmaydi.",
        )
    db.delete(request)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{request_id}/convert-to-order", dependencies=[Depends(require_edit("sotuv"))])
def convert_customer_request_to_order(request_id: int, db: Session = Depends(get_db)):
    request = get_request_or_404(db, request_id)
    return {
        "success": True,
        "data": {
            "id": request.id,
            "request_number": request.request_number,
            "message": "Talabnomani buyurtmaga o'tkazish keyingi bosqichda ulanadi.",
        },
    }
