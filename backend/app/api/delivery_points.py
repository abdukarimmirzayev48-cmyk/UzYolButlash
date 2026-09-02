"""ABZ nuqtalari: ma'lumotnoma va uni boshqa bo'limlarga ulash.

Yetkazish manzili har bosqichda qaytadan yozilardi. Endi u bitta joyda
turadi va talabnoma, shartnoma, buyurtma, partiya unga ishora qiladi.
"""

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.delivery_point import (
    SELECTABLE_STATUSES,
    DeliveryPoint,
    DeliveryPointStatusHistory,
    DeliveryPointType,
)
from backend.app.schemas.client import Page
from backend.app.models.user import User
from backend.app.schemas.delivery_point import (
    DeliveryPointDashboard,
    DeliveryPointHistoryRead,
    DeliveryPointStatusUpdate,
    DeliveryPointCreate,
    DeliveryPointRead,
    DeliveryPointSummary,
    DeliveryPointUpdate,
)
from backend.app.services import delivery_point_export, delivery_point_stats, railway_stations
from backend.app.services.auth import get_current_user, require_edit

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


STATUS_LABELS = {
    "active": "Faol",
    "attention": "E'tibor talab qiladi",
    "inactive": "Faol emas",
    "planned": "Rejalashtirilgan",
}

# Ustun bo'yicha saralash: nomi ekrandagi ustun kaliti, qiymati -- baza
# ustuni. Ro'yxatda bo'lmagan kalit e'tiborga olinmaydi, ya'ni manzildagi
# tasodifiy matn so'rovga tushmaydi.
SORTABLE = {
    "name": DeliveryPoint.name,
    "code": DeliveryPoint.code,
    "region": DeliveryPoint.region,
    "capacity": DeliveryPoint.daily_capacity_tons,
    "responsible": DeliveryPoint.responsible_name,
    "status": DeliveryPoint.status,
    "updated": DeliveryPoint.updated_at,
}


def apply_point_sort(stmt, sort: str | None, order: str | None):
    column = SORTABLE.get(sort or "")
    if column is None:
        # Sukut bo'yicha: avval faol, so'ng nom bo'yicha -- e'tibor talab
        # qiladigani ro'yxat oxirida qolib ketmasin.
        return stmt.order_by(DeliveryPoint.status, DeliveryPoint.name)
    return stmt.order_by(column.desc() if (order or "asc") == "desc" else column.asc())


def point_filters(search, client_id, region, point_type, status_filter, active_only, exclude_type=None):
    """Ro'yxat, panel va eksport aynan bir xil filtrlangan bo'lishi kerak.

    `exclude_type` -- bo'lim ajratish uchun: ABZ ro'yxati stansiyalarni
    ko'rsatmaydi, stansiyalar ro'yxati esa faqat ularni ko'rsatadi. Jadval
    bitta, chunki kartochka bir xil: manzil, koordinata, mas'ul shaxs.
    """
    conditions = []
    if exclude_type:
        conditions.append(DeliveryPoint.point_type != exclude_type)
    if client_id:
        conditions.append(DeliveryPoint.client_id == client_id)
    if region:
        conditions.append(DeliveryPoint.region == region)
    if point_type:
        conditions.append(DeliveryPoint.point_type == point_type)
    if status_filter:
        conditions.append(DeliveryPoint.status == status_filter)
    if active_only:
        conditions.append(DeliveryPoint.status.in_(SELECTABLE_STATUSES))
    if search:
        value = f"%{search}%"
        conditions.append(
            or_(
                DeliveryPoint.name.ilike(value),
                DeliveryPoint.code.ilike(value),
                DeliveryPoint.address.ilike(value),
                DeliveryPoint.district.ilike(value),
                DeliveryPoint.region.ilike(value),
                DeliveryPoint.responsible_name.ilike(value),
                DeliveryPoint.responsible_phone.ilike(value),
            )
        )
    return conditions


# `/{point_id}` dan OLDIN turishi shart: aks holda FastAPI «station-reference»
# ni id deb o'qishga urinadi.
@router.get("/station-reference")
def station_reference(q: str = "", limit: int = Query(20, ge=1, le=220)):
    """Temiryo'l stansiyalari ma'lumotnomasi -- kod, nom, koordinata.

    Kartochka ochilmaydi, faqat qidiriladi: 220 ta stansiyaning hammasini
    yozuv qilib qo'yish panelni ishlatib bo'lmaydigan holga keltirardi.
    """
    return railway_stations.search(q, limit)


@router.get("/dashboard", response_model=DeliveryPointDashboard)
def delivery_points_dashboard(
    db: Session = Depends(get_db),
    search: str | None = None,
    client_id: int | None = None,
    region: str | None = None,
    point_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    active_only: bool = False,
    exclude_type: str | None = None,
):
    stmt = select(DeliveryPoint).options(selectinload(DeliveryPoint.status_history))
    conditions = point_filters(search, client_id, region, point_type, status_filter, active_only, exclude_type)
    if conditions:
        stmt = stmt.where(*conditions)
    points = list(db.scalars(stmt).unique())
    board = delivery_point_stats.build_dashboard(points, status_labels=STATUS_LABELS, station=point_type == DeliveryPointType.railway_station.value)
    return DeliveryPointDashboard(**asdict(board))


@router.get("/export.xlsx")
def export_delivery_points(
    db: Session = Depends(get_db),
    search: str | None = None,
    client_id: int | None = None,
    region: str | None = None,
    point_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    active_only: bool = False,
    exclude_type: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    lang: str = "cyr",
):
    """Ekranda nima ko'rinsa, o'sha eksport qilinadi -- filtr ham, tartib ham."""
    stmt = select(DeliveryPoint).options(selectinload(DeliveryPoint.client))
    conditions = point_filters(search, client_id, region, point_type, status_filter, active_only, exclude_type)
    if conditions:
        stmt = stmt.where(*conditions)
    points = list(db.scalars(apply_point_sort(stmt, sort, order)).unique())
    station = point_type == DeliveryPointType.railway_station.value
    stream = delivery_point_export.build_workbook(points, lang, station=station)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{"temiryol-stansiyalari" if station else "abz-nuqtalari"}.xlsx"'},
    )


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
    exclude_type: str | None = None,
    sort: str | None = None,
    order: str | None = None,
):
    stmt = select(DeliveryPoint).options(selectinload(DeliveryPoint.client))
    conditions = point_filters(search, client_id, region, point_type, status_filter, active_only, exclude_type)
    if conditions:
        stmt = stmt.where(*conditions)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        apply_point_sort(stmt, sort, order).offset((page - 1) * page_size).limit(page_size)
    ).unique()
    return Page(items=[point_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=DeliveryPointRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_delivery_point(payload: DeliveryPointCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_client(db, payload.client_id)
    point = DeliveryPoint(**payload.model_dump())
    db.add(point)
    db.flush()
    db.add(
        DeliveryPointStatusHistory(
            point_id=point.id, old_status=None, new_status=point.status, changed_by=user.username
        )
    )
    db.commit()
    return point_read(get_point_or_404(db, point.id))


@router.get("/{point_id}", response_model=DeliveryPointRead)
def get_delivery_point(point_id: int, db: Session = Depends(get_db)):
    return point_read(get_point_or_404(db, point_id))


@router.patch("/{point_id}", response_model=DeliveryPointRead, dependencies=[Depends(require_edit("sotuv"))])
def update_delivery_point(point_id: int, payload: DeliveryPointUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    point = get_point_or_404(db, point_id)
    data = payload.model_dump(exclude_unset=True)
    check_client(db, data.get("client_id"))
    # Holat formadan ham o'zgarishi mumkin -- tarix ikkala yo'lda ham
    # yoziladi, aks holda panelning hisobida teshik qoladi.
    new_status = data.get("status")
    if new_status is not None and new_status != point.status:
        db.add(
            DeliveryPointStatusHistory(
                point_id=point.id,
                old_status=point.status,
                new_status=new_status,
                changed_by=user.username,
            )
        )
    for name, value in data.items():
        setattr(point, name, value)
    db.commit()
    return point_read(get_point_or_404(db, point.id))


@router.patch("/{point_id}/status", response_model=DeliveryPointRead, dependencies=[Depends(require_edit("sotuv"))])
def update_delivery_point_status(
    point_id: int,
    payload: DeliveryPointStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Holat o'zgarishi tarixga yoziladi.

    Panel «o'tgan oyga nisbatan» degan raqamni shu tarixdan hisoblaydi:
    yozuvsiz u to'qib chiqarilgan bo'lardi.
    """
    point = get_point_or_404(db, point_id)
    if point.status == payload.status:
        return point_read(point)
    db.add(
        DeliveryPointStatusHistory(
            point_id=point.id,
            old_status=point.status,
            new_status=payload.status,
            comment=(payload.comment or "").strip() or None,
            changed_by=user.username,
        )
    )
    point.status = payload.status
    db.commit()
    return point_read(get_point_or_404(db, point.id))


@router.get("/{point_id}/history", response_model=list[DeliveryPointHistoryRead])
def delivery_point_history(point_id: int, db: Session = Depends(get_db)):
    get_point_or_404(db, point_id)
    return list(
        db.scalars(
            select(DeliveryPointStatusHistory)
            .where(DeliveryPointStatusHistory.point_id == point_id)
            .order_by(DeliveryPointStatusHistory.created_at.desc())
        )
    )


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
