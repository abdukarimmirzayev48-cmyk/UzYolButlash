from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.transport import Transport
from backend.app.schemas.client import Page
from backend.app.schemas.transport import TransportCreate, TransportRead, TransportUpdate


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
