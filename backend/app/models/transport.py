from enum import Enum

from sqlalchemy import Boolean, Enum as SAEnum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class TransportStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"


class Transport(Base, TimestampMixin):
    __tablename__ = "transports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    carrier_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    driver_name: Mapped[str | None] = mapped_column(String(255), index=True)
    driver_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    trailer_number: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(64), index=True)
    capacity: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[TransportStatus] = mapped_column(SAEnum(TransportStatus), default=TransportStatus.active, nullable=False, index=True)
    is_own: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
