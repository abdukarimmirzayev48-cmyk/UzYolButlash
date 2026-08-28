from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, object_session, selectinload

from backend.app.db.session import get_db
from backend.app.models.attendance import Employee
from backend.app.models.delivery import DeliveryBatch, Logistics, LogisticsStatus
from backend.app.models.transport import (
    OPEN_REPAIR_STATUSES,
    SERVICE_CATEGORIES,
    UNAVAILABLE_STATUSES,
    RepairStatus,
    Transport,
    TransportCheckIn,
    TransportEvent,
    TransportRepair,
    TransportRepairPart,
    TransportStatus,
)
from backend.app.schemas.client import Page
from backend.app.services import logistics_timeline, repair_workflow, transport_events, transport_readiness, transport_repairs, transport_usage
from backend.app.models.user import User
from backend.app.services.auth import get_current_user, require_edit
from backend.app.services.telegram_bot import request_checkin
from backend.app.schemas.transport import (
    RepairPartRead,
    TransportRepairCreate,
    TransportRepairRead,
    TransportRepairStatusUpdate,
    TransportRepairSummary,
    TransportRepairUpdate,
    TransportTrip,
    TransportUsage,
    TransportEventCreate,
    TransportEventRead,
    TransportEventSummary,
    TransportEventUpdate,
    TransportCheckInRead,
    TransportCreate,
    TransportRead,
    TransportUpdate,
)

TERMINAL_LOGISTICS_STATUSES = {LogisticsStatus.delivered, LogisticsStatus.completed, LogisticsStatus.cancelled, LogisticsStatus.issue}
CARGO_LOGISTICS_STATUSES = {LogisticsStatus.loaded, LogisticsStatus.in_transit, LogisticsStatus.arrived, LogisticsStatus.unloading}


router = APIRouter(prefix="/api/transports", tags=["transports"])


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_transport_or_404(db: Session, transport_id: int) -> Transport:
    transport = db.get(Transport, transport_id)
    if not transport:
        raise HTTPException(status_code=404, detail="Transport topilmadi")
    return transport


def sync_transport_driver_name(transport: Transport, db: Session, *, had_link: bool = True) -> None:
    """Xodim tanlansa, ism shundan olinadi.

    Ilgari xodim tanlanmagan bo'lsa ism o'chirib tashlanardi. Formada esa ism
    uchun alohida maydon yo'q -- faqat xodimlar ro'yxati. Natijada bog'lanmagan,
    lekin ismi qo'lda yozilgan mashinada boshqa maydonni (masalan, sug'urta
    muddatini) saqlasangiz, haydovchi ismi jimgina yo'qolardi. Endi ism faqat
    haqiqatan bog'lanish uzilganda o'chiriladi.
    """
    if transport.driver_employee_id is None:
        if had_link:
            transport.driver_name = None
        return
    employee = db.get(Employee, transport.driver_employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tanlangan xodim topilmadi.")
    transport.driver_name = employee.full_name


def odometer_readings(db: Session, transport_ids: list[int]) -> dict[int, dict]:
    """Har bir mashina uchun odometrning ikkita oxirgi manbasi.

    Manbalar ikkita: haydovchi qaydnomasi va reys oxiri. Ilgari faqat
    qaydnoma o'qilardi, keyin ikkovidan kattasi olinardi -- lekin «kattasi»
    ikkovi ham to'g'ri degan taxminga asoslanadi. Ishlab turgan bazada
    qaydnomada 520 555 km, o'sha mashinaning reyslarida esa 43 630 km
    turibdi: bu «biri yangiroq» emas, «biri xato» degani, va uni jimgina
    tanlab olish keyingi TO hisobini butunlay buzadi.

    Shuning uchun vaqt bo'yicha oxirgisi olinadi, oldingisi kattaroq bo'lib
    chiqsa esa aytiladi: odometr orqaga yurmaydi.
    """
    from backend.app.models.delivery import Logistics

    if not transport_ids:
        return {}
    readings: dict[int, dict] = {transport_id: {} for transport_id in transport_ids}
    checkins = db.execute(
        select(TransportCheckIn.transport_id, TransportCheckIn.odometer_km, TransportCheckIn.created_at)
        .where(TransportCheckIn.transport_id.in_(transport_ids), TransportCheckIn.odometer_km.isnot(None))
        .order_by(TransportCheckIn.created_at.desc())
    ).all()
    for transport_id, odometer, at in checkins:
        readings[transport_id].setdefault("checkin", (Decimal(odometer), at))
    trips = db.execute(
        select(Logistics.transport_id, Logistics.odometer_end_km, Logistics.returned_at, Logistics.actual_delivery_date)
        .where(Logistics.transport_id.in_(transport_ids), Logistics.odometer_end_km.isnot(None))
    ).all()
    for transport_id, odometer, returned_at, delivery_date in trips:
        at = returned_at or (datetime.combine(delivery_date, datetime.min.time()) if delivery_date else None)
        if at is None:
            continue
        current = readings[transport_id].get("trip")
        if current is None or at > current[1]:
            readings[transport_id]["trip"] = (Decimal(odometer), at)
    return readings


def odometer_state(reading: dict) -> tuple[Decimal | None, bool]:
    """Oxirgi o'lchov va manbalar bir-biriga zid ekani."""
    entries = [value for value in (reading.get("checkin"), reading.get("trip")) if value]
    if not entries:
        return None, False
    entries.sort(key=lambda pair: pair[1])
    latest = entries[-1][0]
    conflict = len(entries) > 1 and entries[0][0] > entries[-1][0]
    return latest, conflict


def current_odometer(db: Session, transport_id: int) -> tuple[Decimal | None, bool]:
    return odometer_state(odometer_readings(db, [transport_id]).get(transport_id, {}))


# Mashina bo'yicha reyslar. Faqat bog'langanlari olinadi -- davlat raqami
# bo'yicha qidirish yana o'sha noaniqlikni qaytaradi, chunki bazada bitta
# raqam bir necha yozuvda takrorlangan.
def trips_of(db: Session, transport_id: int) -> list[Logistics]:
    return list(
        db.scalars(
            select(Logistics)
            .where(Logistics.transport_id == transport_id)
            .options(
                selectinload(Logistics.batch).selectinload(DeliveryBatch.items),
                selectinload(Logistics.batch).selectinload(DeliveryBatch.client),
            )
            .order_by(Logistics.created_at.desc())
        ).unique()
    )


def trip_row(logistics: Logistics) -> TransportTrip:
    batch = logistics.batch
    timeline = logistics_timeline.build_timeline(logistics)
    return TransportTrip(
        id=logistics.id,
        logistics_number=logistics.logistics_number,
        batch_number=batch.batch_number if batch else None,
        client_name=batch.client.name if batch and batch.client else None,
        route_name=logistics.route_name,
        status=logistics.status.value,
        trip_date=logistics.actual_pickup_date or logistics.planned_pickup_date,
        tons=_batch_tonnage(batch),
        distance_km=logistics.distance_km,
        fuel_liters=logistics.fuel_consumption_liters,
        total_hours=timeline.total_hours,
    )


def usage_of(transport: Transport, trips: list[Logistics]) -> TransportUsage:
    usage = transport_usage.build_usage(
        trips=[
            {
                "date": row.actual_pickup_date or row.planned_pickup_date,
                "tons": _batch_tonnage(row.batch),
                "distance_km": row.distance_km,
                "loaded_km": row.loaded_mileage_km,
                "empty_km": row.empty_mileage_km,
                "fuel_liters": row.fuel_consumption_liters,
            }
            for row in trips
        ],
        norm_loaded=transport.fuel_norm_loaded,
        norm_empty=transport.fuel_norm_empty,
    )
    return TransportUsage(**usage.__dict__)


def with_readiness(transport: Transport, current_km: Decimal | None, odometer_conflict: bool = False) -> TransportRead:
    result = TransportRead.model_validate(transport)
    readiness = transport_readiness.build_readiness(
        transport, today=date.today(), current_km=current_km, odometer_conflict=odometer_conflict
    )
    return result.model_copy(update={"readiness": readiness})


@router.get("", response_model=Page[TransportRead])
def list_transports(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    risk_filter: str | None = Query(default=None, alias="risk"),
):
    stmt = select(Transport)
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                Transport.driver_name.ilike(value),
                Transport.driver_phone.ilike(value),
                Transport.vehicle_number.ilike(value),
                Transport.trailer_number.ilike(value),
            )
        )
    if status_filter:
        filters.append(Transport.status == status_filter)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Transport.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    readings = odometer_readings(db, [row.id for row in rows])
    items = [with_readiness(row, *odometer_state(readings.get(row.id, {}))) for row in rows]
    # Hujjat riski bazada saqlanmaydi -- u sanaga qarab hisoblanadi -- shuning
    # uchun filtr SQL da emas, shu yerda qo'llanadi.
    if risk_filter:
        items = [item for item in items if item.readiness and item.readiness.level == risk_filter]
    return Page(items=items, total=total if not risk_filter else len(items), page=page, page_size=page_size)


def _batch_tonnage(batch: DeliveryBatch | None) -> Decimal:
    if not batch:
        return Decimal("0")
    total = Decimal("0")
    for item in batch.items:
        total += item.accepted_quantity or item.loaded_quantity or item.planned_quantity or Decimal("0")
    return total


@router.get("/monitoring")
def transport_monitoring(db: Session = Depends(get_db)):
    transports = db.scalars(select(Transport).order_by(Transport.vehicle_number)).all()
    all_logistics = db.scalars(
        select(Logistics)
        .options(
            selectinload(Logistics.batch).selectinload(DeliveryBatch.items),
            selectinload(Logistics.batch).selectinload(DeliveryBatch.order),
        )
        .order_by(Logistics.created_at.desc())
    ).all()

    logistics_by_vehicle: dict[str, list[Logistics]] = {}
    for row in all_logistics:
        if row.vehicle_number:
            logistics_by_vehicle.setdefault(row.vehicle_number, []).append(row)

    month_start = date.today().replace(day=1)
    summary = {
        "total": 0, "working": 0, "idle": 0, "maintenance": 0,
        "moving_with_cargo": 0, "moving_without_cargo": 0, "waiting": 0, "total_trips": 0,
    }
    working_rows: list[dict[str, Any]] = []
    idle_rows: list[dict[str, Any]] = []
    route_stats: dict[str, dict[str, Any]] = {}

    for transport in transports:
        summary["total"] += 1
        vehicle_logs = logistics_by_vehicle.get(transport.vehicle_number, [])
        summary["total_trips"] += sum(1 for row in vehicle_logs if row.created_at.date() >= month_start)

        for row in vehicle_logs:
            if not row.route_name:
                continue
            stat = route_stats.setdefault(row.route_name, {"route_name": row.route_name, "vehicles": set(), "trip_count": 0})
            stat["vehicles"].add(transport.vehicle_number)
            stat["trip_count"] += 1

        last_log = vehicle_logs[0] if vehicle_logs else None
        last_order_number = last_log.batch.order.order_number if last_log and last_log.batch and last_log.batch.order else None

        if transport.status in UNAVAILABLE_STATUSES:
            summary["maintenance"] += 1
            idle_rows.append({
                "vehicle_number": transport.vehicle_number,
                "driver_name": transport.driver_name,
                "status": transport.status,
                "notes": transport.notes,
                "last_order_number": last_order_number,
                "last_logistics_status": last_log.status if last_log else None,
            })
            continue

        active_log = next((row for row in vehicle_logs if row.status not in TERMINAL_LOGISTICS_STATUSES), None)
        if not active_log:
            summary["idle"] += 1
            idle_rows.append({
                "vehicle_number": transport.vehicle_number,
                "driver_name": transport.driver_name,
                "status": transport.status,
                "notes": transport.notes,
                "last_order_number": last_order_number,
                "last_logistics_status": last_log.status if last_log else None,
            })
            continue

        summary["working"] += 1
        if active_log.status in CARGO_LOGISTICS_STATUSES:
            summary["moving_with_cargo"] += 1
            work_status = "moving_with_cargo"
        elif active_log.status == LogisticsStatus.vehicle_assigned:
            summary["moving_without_cargo"] += 1
            work_status = "moving_without_cargo"
        else:
            summary["waiting"] += 1
            work_status = "waiting"

        distinct_clients = {row.batch.client_id for row in vehicle_logs if row.batch}
        working_rows.append({
            "vehicle_number": transport.vehicle_number,
            "driver_name": transport.driver_name,
            "work_status": work_status,
            "cargo_tonnage": _batch_tonnage(active_log.batch),
            "departure_point": active_log.loading_address,
            "current_location": transport.current_location,
            "destination": active_log.delivery_address,
            "distance_km": active_log.distance_km,
            "fuel_liters": active_log.fuel_consumption_liters,
            "assigned_orgs_count": len(distinct_clients),
        })

    routes = [
        {"route_name": stat["route_name"], "vehicle_count": len(stat["vehicles"]), "trip_count": stat["trip_count"]}
        for stat in route_stats.values()
    ]
    return {"summary": summary, "working": working_rows, "idle": idle_rows, "routes": routes}


@router.post("", response_model=TransportRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_transport(payload: TransportCreate, db: Session = Depends(get_db)):
    transport = Transport(**payload.model_dump())
    sync_transport_driver_name(transport, db, had_link=False)
    db.add(transport)
    db.commit()
    db.refresh(transport)
    return with_readiness(transport, None, False)


# Izohga yoziladigan yorliqlar. Interfeysdagi ro'yxat bilan bir xil
# bo'lishi kerak, aks holda tarixda boshqa nom paydo bo'ladi.
REPAIR_STATUS_LABELS = {
    "new": "Yangi ariza",
    "diagnosis": "Diagnostika",
    "waiting_parts": "Ehtiyot qism kutilmoqda",
    "in_repair": "Ta'mirda",
    "done": "Tayyor",
    "closed": "Yopilgan",
    "cancelled": "Bekor qilingan",
}

def get_repair_or_404(db: Session, repair_id: int) -> TransportRepair:
    repair = db.scalars(
        select(TransportRepair).where(TransportRepair.id == repair_id).options(
            selectinload(TransportRepair.parts), selectinload(TransportRepair.transport)
        )
    ).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Ta'mir arizasi topilmadi.")
    return repair


def repair_read(repair: TransportRepair) -> TransportRepairRead:
    """Turib qolish soati, xarajat va mumkin bo'lgan o'tishlar saqlanmaydi.

    Ular har o'qishda hisoblanadi: ehtiyot qism qo'shilsa xarajat o'zi
    o'zgaradi, tugagani yozilmagan turib qolish esa hozirgacha o'sib
    boradi -- mashina hali ham turibdi degani.
    """
    result = TransportRepairRead.model_validate(repair)
    parts = [
        RepairPartRead.model_validate(part).model_copy(update={"line_total": transport_repairs.part_total(part)})
        for part in repair.parts
    ]
    return result.model_copy(
        update={
            "parts": parts,
            "downtime_hours": transport_repairs.downtime_hours(repair, now=datetime.now()),
            "parts_amount": transport_repairs.parts_total(repair),
            "total_amount": transport_repairs.repair_total(repair),
            "transitions": repair_workflow.transitions_from(repair.status),
        }
    )


def repair_filters(search, transport_id, category, severity, status_filter, open_only):
    """Ro'yxat va xulosa aynan bir xil filtrlanadi."""
    stmt = select(TransportRepair)
    if transport_id:
        stmt = stmt.where(TransportRepair.transport_id == transport_id)
    if category:
        stmt = stmt.where(TransportRepair.category == category)
    if severity:
        stmt = stmt.where(TransportRepair.severity == severity)
    if status_filter:
        stmt = stmt.where(TransportRepair.status == status_filter)
    if open_only:
        stmt = stmt.where(TransportRepair.status.in_(OPEN_REPAIR_STATUSES))
    if search:
        value = f"%{search}%"
        stmt = stmt.join(Transport).where(
            or_(
                TransportRepair.repair_number.ilike(value),
                TransportRepair.description.ilike(value),
                TransportRepair.contractor.ilike(value),
                TransportRepair.breakdown_location.ilike(value),
                Transport.vehicle_number.ilike(value),
            )
        )
    return stmt


def replace_repair_parts(db: Session, repair: TransportRepair, parts: list) -> None:
    for existing in list(repair.parts):
        db.delete(existing)
    db.flush()
    for payload in parts:
        db.add(TransportRepairPart(repair_id=repair.id, **payload.model_dump()))
    db.flush()
    db.expire(repair, ["parts"])


def sync_transport_from_repairs(db: Session, transport_id: int) -> None:
    """Yura olmaydigan ochiq ariza bo'lsa, mashina «ta'mirda» bo'ladi.

    Ilgari holat qo'lda qo'yilardi: ariza ochilgan, mashina esa ro'yxatda
    «bo'sh» bo'lib turaverardi va unga reys berilardi. Bu yerda faqat
    ta'mir sababli qo'yilgan holat qaytariladi -- odam «parkda emas» yoki
    «bekor turibdi» deb qo'ygan bo'lsa, unga tegilmaydi.
    """
    transport = db.get(Transport, transport_id)
    if not transport:
        return
    blocked = db.scalars(
        select(TransportRepair).where(
            TransportRepair.transport_id == transport_id,
            TransportRepair.status.in_(OPEN_REPAIR_STATUSES),
            TransportRepair.can_move.is_(False),
        )
    ).first()
    if blocked and transport.status == TransportStatus.free:
        transport.status = TransportStatus.repair
    elif not blocked and transport.status == TransportStatus.repair:
        transport.status = TransportStatus.free


def apply_service_completion(db: Session, repair: TransportRepair) -> None:
    """Rejali TO yopilganda mashina kartochkasidagi oxirgi TO yangilanadi.

    Keyingi TO shundan hisoblanadi, ya'ni u o'zi siljiydi. Buni qo'lda
    yozish kerak bo'lsa, unutiladi -- va kartochkada «TO muddati keldi»
    degan yozuv oylab turib qoladi.
    """
    if repair.category not in SERVICE_CATEGORIES:
        return
    transport = db.get(Transport, repair.transport_id)
    if not transport:
        return
    done_on = (repair.downtime_finished_at or repair.opened_at).date()
    if transport.last_service_date is None or done_on >= transport.last_service_date:
        transport.last_service_date = done_on
    if repair.odometer_km is not None and (
        transport.last_service_km is None or Decimal(repair.odometer_km) >= Decimal(transport.last_service_km)
    ):
        transport.last_service_km = repair.odometer_km


@router.get("/repairs", response_model=Page[TransportRepairRead])
def list_repairs(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    transport_id: int | None = None,
    category: str | None = None,
    severity: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    open_only: bool = False,
):
    stmt = repair_filters(search, transport_id, category, severity, status_filter, open_only).options(
        selectinload(TransportRepair.parts), selectinload(TransportRepair.transport)
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(TransportRepair.opened_at.desc(), TransportRepair.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()
    return Page(items=[repair_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.get("/repairs/summary", response_model=TransportRepairSummary)
def repairs_summary(
    db: Session = Depends(get_db),
    search: str | None = None,
    transport_id: int | None = None,
    category: str | None = None,
    severity: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    open_only: bool = False,
):
    stmt = repair_filters(search, transport_id, category, severity, status_filter, open_only).options(
        selectinload(TransportRepair.parts)
    )
    repairs = list(db.scalars(stmt).unique())
    return TransportRepairSummary(**transport_repairs.build_summary(repairs, now=datetime.now()).__dict__)


@router.post("/repairs", response_model=TransportRepairRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_repair(payload: TransportRepairCreate, db: Session = Depends(get_db)):
    get_transport_or_404(db, payload.transport_id)
    data = payload.model_dump(exclude={"parts"})
    repair = TransportRepair(**data)
    if not repair.repair_number:
        day = repair.opened_at.date()
        prefix = f"RM-{day.strftime('%Y%m%d')}"
        taken = set(db.scalars(select(TransportRepair.repair_number).where(TransportRepair.repair_number.like(f"{prefix}%"))).all())
        repair.repair_number = transport_repairs.next_repair_number(taken, day)
    db.add(repair)
    db.flush()
    replace_repair_parts(db, repair, payload.parts)
    sync_transport_from_repairs(db, repair.transport_id)
    db.commit()
    return repair_read(get_repair_or_404(db, repair.id))


@router.get("/repairs/{repair_id}", response_model=TransportRepairRead)
def get_repair(repair_id: int, db: Session = Depends(get_db)):
    return repair_read(get_repair_or_404(db, repair_id))


@router.patch("/repairs/{repair_id}", response_model=TransportRepairRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_repair(repair_id: int, payload: TransportRepairUpdate, db: Session = Depends(get_db)):
    repair = get_repair_or_404(db, repair_id)
    data = payload.model_dump(exclude_unset=True, exclude={"parts"})
    update_model(repair, data)
    if payload.parts is not None:
        replace_repair_parts(db, repair, payload.parts)
    sync_transport_from_repairs(db, repair.transport_id)
    db.commit()
    return repair_read(get_repair_or_404(db, repair.id))


@router.patch("/repairs/{repair_id}/status", response_model=TransportRepairRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_repair_status(repair_id: int, payload: TransportRepairStatusUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    repair = get_repair_or_404(db, repair_id)
    current = repair.status
    if payload.status == current:
        return repair_read(repair)
    kind = repair_workflow.transition_kind(current, payload.status)
    if kind is None:
        raise HTTPException(status_code=422, detail=f"{repair_workflow.MSG_BAD_TRANSITION}: {REPAIR_STATUS_LABELS.get(current.value, current.value)}")
    comment = (payload.comment or "").strip()
    if kind in {"backward", "cancel"} and not comment:
        raise HTTPException(status_code=422, detail=repair_workflow.MSG_COMMENT_REQUIRED)
    # Yopishdan oldin natija yozilishi kerak: natijasiz yopilgan ariza
    # keyin «nima qilingan edi» degan savolga javob bermaydi.
    if payload.status == RepairStatus.closed and not (repair.result or "").strip():
        raise HTTPException(status_code=422, detail=repair_workflow.MSG_RESULT_REQUIRED)

    repair.status = payload.status
    old_label = REPAIR_STATUS_LABELS.get(current.value, current.value)
    new_label = REPAIR_STATUS_LABELS.get(payload.status.value, payload.status.value)
    entry = f"{repair_workflow.MSG_STATUS_CHANGED}: {old_label} -> {new_label}"
    if comment:
        entry = f"{entry}. {comment}"
    repair.note = f"{repair.note}\n{entry}" if repair.note else entry
    # Ta'mir tugagach turib qolish ham tugaydi -- alohida eslash shart emas.
    if payload.status in (RepairStatus.done, RepairStatus.closed) and repair.downtime_started_at and not repair.downtime_finished_at:
        repair.downtime_finished_at = datetime.now()
    if payload.status == RepairStatus.closed:
        apply_service_completion(db, repair)
    sync_transport_from_repairs(db, repair.transport_id)
    db.commit()
    return repair_read(get_repair_or_404(db, repair.id))


@router.delete("/repairs/{repair_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_repair(repair_id: int, db: Session = Depends(get_db)):
    repair = get_repair_or_404(db, repair_id)
    transport_id = repair.transport_id
    db.delete(repair)
    db.commit()
    sync_transport_from_repairs(db, transport_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_event_or_404(db: Session, event_id: int) -> TransportEvent:
    event = db.get(TransportEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Hodisa topilmadi.")
    return event


def event_read(event: TransportEvent) -> TransportEventRead:
    result = TransportEventRead.model_validate(event)
    logistics_number = None
    if event.logistics_id:
        logistics_number = db_logistics_number(event)
    return result.model_copy(update={"logistics_number": logistics_number})


def db_logistics_number(event: TransportEvent) -> str | None:
    """Reys raqami hodisada saqlanmaydi, bog'lanish orqali o'qiladi."""
    from backend.app.models.delivery import Logistics

    session = object_session(event)
    if session is None:
        return None
    logistics = session.get(Logistics, event.logistics_id)
    return logistics.logistics_number if logistics else None


def assign_event_number(db: Session, event: TransportEvent) -> None:
    if event.event_number:
        return
    day = event.occurred_at.date()
    prefix = f"EV-{day.strftime('%Y%m%d')}"
    taken = set(db.scalars(select(TransportEvent.event_number).where(TransportEvent.event_number.like(f"{prefix}%"))).all())
    event.event_number = transport_events.next_event_number(taken, day)


def event_filters(
    search: str | None,
    transport_id: int | None,
    event_type: str | None,
    check_result: str | None,
    status_filter: str | None,
):
    """Ro'yxat va xulosa aynan bir xil filtrlangan bo'lishi kerak.

    Aks holda ekranda «1 ta hodisa» yozilib turadi, kartochkada esa «7 tasi
    tekshirilmagan» -- ikkovi bir sahifada, bir-biriga zid.
    """
    stmt = select(TransportEvent)
    if transport_id:
        stmt = stmt.where(TransportEvent.transport_id == transport_id)
    if event_type:
        stmt = stmt.where(TransportEvent.event_type == event_type)
    if check_result:
        stmt = stmt.where(TransportEvent.check_result == check_result)
    if status_filter:
        stmt = stmt.where(TransportEvent.status == status_filter)
    if search:
        value = f"%{search}%"
        stmt = stmt.join(Transport).where(
            or_(
                TransportEvent.event_number.ilike(value),
                TransportEvent.source.ilike(value),
                TransportEvent.location.ilike(value),
                TransportEvent.note.ilike(value),
                Transport.vehicle_number.ilike(value),
            )
        )
    return stmt


@router.get("/events", response_model=Page[TransportEventRead])
def list_all_events(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    transport_id: int | None = None,
    event_type: str | None = None,
    check_result: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
):
    """Butun park bo'yicha hodisalar jurnali.

    Har bir mashinaning o'z sahifasi ham bor, lekin nazorat aynan shu
    ro'yxatdan boshlanadi: tekshirilmagan hodisa qaysi mashinada ekani emas,
    umuman qanchasi qolgani muhim.
    """
    stmt = event_filters(search, transport_id, event_type, check_result, status_filter).options(
        selectinload(TransportEvent.transport)
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(TransportEvent.occurred_at.desc(), TransportEvent.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()
    return Page(items=[event_read(row) for row in rows], total=total, page=page, page_size=page_size)


@router.get("/events/summary", response_model=TransportEventSummary)
def events_summary(
    db: Session = Depends(get_db),
    search: str | None = None,
    transport_id: int | None = None,
    event_type: str | None = None,
    check_result: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
):
    stmt = event_filters(search, transport_id, event_type, check_result, status_filter)
    events = list(db.scalars(stmt).unique())
    return TransportEventSummary(**transport_events.build_summary(events).__dict__)


@router.post("/events", response_model=TransportEventRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_event(payload: TransportEventCreate, db: Session = Depends(get_db)):
    get_transport_or_404(db, payload.transport_id)
    event = TransportEvent(**payload.model_dump())
    assign_event_number(db, event)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_read(event)


@router.get("/events/{event_id}", response_model=TransportEventRead)
def get_event(event_id: int, db: Session = Depends(get_db)):
    return event_read(get_event_or_404(db, event_id))


@router.patch("/events/{event_id}", response_model=TransportEventRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_event(event_id: int, payload: TransportEventUpdate, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    update_model(event, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(event)
    return event_read(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_event(event_id: int, db: Session = Depends(get_db)):
    db.delete(get_event_or_404(db, event_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{transport_id}", response_model=TransportRead)
def get_transport(transport_id: int, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    trips = trips_of(db, transport.id)
    repairs = list(
        db.scalars(
            select(TransportRepair)
            .where(TransportRepair.transport_id == transport.id)
            .options(selectinload(TransportRepair.parts))
            .order_by(TransportRepair.opened_at.desc())
        ).unique()
    )
    summary = transport_repairs.build_summary(repairs, now=datetime.now())
    return with_readiness(transport, *current_odometer(db, transport.id)).model_copy(
        update={
            "usage": usage_of(transport, trips),
            "trips": [trip_row(row) for row in trips],
            "repair_summary": TransportRepairSummary(**summary.__dict__),
            "open_repairs": [repair_read(row) for row in repairs if row.status in OPEN_REPAIR_STATUSES],
        }
    )


@router.patch("/{transport_id}", response_model=TransportRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_transport(transport_id: int, payload: TransportUpdate, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    data = payload.model_dump(exclude_unset=True)
    had_link = transport.driver_employee_id is not None
    update_model(transport, data)
    if "driver_employee_id" in data:
        sync_transport_driver_name(transport, db, had_link=had_link)
    db.commit()
    db.refresh(transport)
    return with_readiness(transport, *current_odometer(db, transport.id))


@router.delete("/{transport_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_transport(transport_id: int, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    db.delete(transport)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{transport_id}/checkins", response_model=Page[TransportCheckInRead])
def list_transport_checkins(transport_id: int, db: Session = Depends(get_db), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    get_transport_or_404(db, transport_id)
    stmt = select(TransportCheckIn).where(TransportCheckIn.transport_id == transport_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.options(selectinload(TransportCheckIn.employee)).order_by(TransportCheckIn.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("/{transport_id}/checkin-request", dependencies=[Depends(require_edit("yetkazib_berish"))])
def request_transport_checkin(transport_id: int, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    sent = request_checkin(db, transport)
    if not sent:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Haydovchi Telegram botga ulanmagan yoki biriktirilmagan.")
    return {"sent": True}
