"""ABZ nuqtalari: ma'lumotnoma va uni boshqa bo'limlarga ulash.

Yetkazish manzili har bosqichda qaytadan yozilardi. Endi u bitta joyda
turadi va talabnoma, shartnoma, buyurtma, partiya unga ishora qiladi.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.delivery_point import SELECTABLE_STATUSES, DeliveryPoint
from backend.app.schemas.client import Page
from backend.app.schemas.delivery_point import (
    DeliveryPointCreate,
    DeliveryPointRead,
    DeliveryPointSummary,
    DeliveryPointUpdate,
)
from backend.app.services.auth import require_edit

router = APIRouter(prefix="/api/delivery-points", tags=["delivery-points"])

MSG_NOT_FOUND = "Yetkazish nuqtasi topilmadi."
MSG_CLIENT_NOT_FOUND = "Tanlangan mijoz topilmadi."
MSG_IN_USE = "Nuqta ishlatilmoqda, o'chirib bo'lmaydi. Uni faol emas deb belgilang."


# `full_address` va `map_url` modelning xossalari -- Pydantic ularni
# `from_attributes` orqali o'zi oladi, ya'ni ular nuqta ko'rsatiladigan
# har bir joyda bir xil chiqadi.
def full_address_of(point: DeliveryPoint) -> str | None:
    return point.full_address


def point_read(point: DeliveryPoint) -> DeliveryPointRead:
    return DeliveryPointRead.model_validate(point)


def point_summary(point: DeliveryPoint | None) -> DeliveryPointSummary | None:
    return None if point is None else DeliveryPointSummary.model_validate(point)


def get_point_or_404(db: Session, point_id: int) -> DeliveryPoint:
    point = db.scalars(
        select(DeliveryPoint).where(DeliveryPoint.id == point_id).options(selectinload(DeliveryPoint.client))
    ).first()
    if not point:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_NOT_FOUND)
    return point


def check_client(db: Session, client_id: int | None) -> None:
    if client_id and not db.get(Client, client_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=MSG_CLIENT_NOT_FOUND)


@router.get("", response_model=Page[DeliveryPointRead])
def list_delivery_points(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    client_id: int | None = None,
    region: str | None = None,
    point_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    active_only: bool = False,
):
    stmt = select(DeliveryPoint).options(selectinload(DeliveryPoint.client))
    if client_id:
        stmt = stmt.where(DeliveryPoint.client_id == client_id)
    if region:
        stmt = stmt.where(DeliveryPoint.region == region)
    if point_type:
        stmt = stmt.where(DeliveryPoint.point_type == point_type)
    if active_only:
        stmt = stmt.where(DeliveryPoint.status.in_(SELECTABLE_STATUSES))
    if status_filter:
        stmt = stmt.where(DeliveryPoint.status == status_filter)
    if search:
        value = f"%{search}%"
        stmt = stmt.where(
            or_(
                DeliveryPoint.name.ilike(value),
                DeliveryPoint.code.ilike(value),
                DeliveryPoint.address.ilike(value),
                DeliveryPoint.district.ilike(value),
                DeliveryPoint.responsible_name.ilike(value),
                DeliveryPoint.responsible_phone.ilike(value),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(DeliveryPoint.status, DeliveryPoint.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()
    return Page(items=[point_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=DeliveryPointRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_delivery_point(payload: DeliveryPointCreate, db: Session = Depends(get_db)):
    check_client(db, payload.client_id)
    point = DeliveryPoint(**payload.model_dump())
    db.add(point)
    db.commit()
    return point_read(get_point_or_404(db, point.id))


@router.get("/{point_id}", response_model=DeliveryPointRead)
def get_delivery_point(point_id: int, db: Session = Depends(get_db)):
    return point_read(get_point_or_404(db, point_id))


@router.patch("/{point_id}", response_model=DeliveryPointRead, dependencies=[Depends(require_edit("sotuv"))])
def update_delivery_point(point_id: int, payload: DeliveryPointUpdate, db: Session = Depends(get_db)):
    point = get_point_or_404(db, point_id)
    data = payload.model_dump(exclude_unset=True)
    check_client(db, data.get("client_id"))
    for name, value in data.items():
        setattr(point, name, value)
    db.commit()
    return point_read(get_point_or_404(db, point.id))


@router.delete("/{point_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_delivery_point(point_id: int, db: Session = Depends(get_db)):
    """Ishlatilgan nuqta o'chirilmaydi.

    Uni o'chirish talabnoma, shartnoma va partiyalardagi manzilni yo'qotadi
    -- ya'ni yetkazilgan yuk qayerga borgani hujjatdan chiqib ketadi.
    Ishlatilganini faol emas deb belgilash kerak: u yangi hujjatlarda
    ko'rinmaydi, eskilari esa joyida qoladi.
    """
    from backend.app.models.contract import Contract
    from backend.app.models.customer_request import CustomerRequest
    from backend.app.models.delivery import DeliveryBatch
    from backend.app.models.order import Order

    point = get_point_or_404(db, point_id)
    for model in (CustomerRequest, Contract, Order, DeliveryBatch):
        used = db.scalar(select(func.count()).select_from(model).where(model.delivery_point_id == point_id))
        if used:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=MSG_IN_USE)
    db.delete(point)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
