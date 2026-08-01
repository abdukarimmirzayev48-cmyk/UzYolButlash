from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.delivery import DeliveryBatch, Logistics, LogisticsStatus
from backend.app.models.transport import Transport, TransportStatus
from backend.app.schemas.client import Page
from backend.app.schemas.transport import TransportCreate, TransportRead, TransportUpdate

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


@router.get("", response_model=Page[TransportRead])
def list_transports(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
):
    stmt = select(Transport)
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                Transport.carrier_name.ilike(value),
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
    return Page(items=rows, total=total, page=page, page_size=page_size)


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

        if transport.status == TransportStatus.maintenance:
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


@router.post("", response_model=TransportRead, status_code=status.HTTP_201_CREATED)
def create_transport(payload: TransportCreate, db: Session = Depends(get_db)):
    transport = Transport(**payload.model_dump())
    db.add(transport)
    db.commit()
    db.refresh(transport)
    return transport


@router.get("/{transport_id}", response_model=TransportRead)
def get_transport(transport_id: int, db: Session = Depends(get_db)):
    return get_transport_or_404(db, transport_id)


@router.patch("/{transport_id}", response_model=TransportRead)
def update_transport(transport_id: int, payload: TransportUpdate, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    update_model(transport, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(transport)
    return transport


@router.delete("/{transport_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transport(transport_id: int, db: Session = Depends(get_db)):
    transport = get_transport_or_404(db, transport_id)
    db.delete(transport)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
