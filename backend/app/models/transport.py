from datetime import date as date_cls, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.attendance import Employee
from backend.app.models.client import TimestampMixin


class TransportStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"


class FuelEntryType(str, Enum):
    added = "added"
    consumed = "consumed"


class TransportCheckInKind(str, Enum):
    report = "report"
    stopped = "stopped"
    resumed = "resumed"


class Transport(Base, TimestampMixin):
    __tablename__ = "transports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    driver_employee_id: Mapped[int | None] = mapped_column(ForeignKey("attendance_employees.id"), index=True)
    driver_name: Mapped[str | None] = mapped_column(String(255), index=True)
    driver_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    trailer_number: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(64), index=True)
    capacity: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[TransportStatus] = mapped_column(SAEnum(TransportStatus), default=TransportStatus.active, nullable=False, index=True)
    current_location: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    driver: Mapped[Employee | None] = relationship()
    fuel_logs: Mapped[list["TransportFuelLog"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportFuelLog.entry_date.desc(), TransportFuelLog.id.desc()")
    check_ins: Mapped[list["TransportCheckIn"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportCheckIn.created_at.desc()")


class TransportFuelLog(Base, TimestampMixin):
    __tablename__ = "transport_fuel_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), index=True)
    entry_date: Mapped[date_cls] = mapped_column(Date, nullable=False, default=date_cls.today, index=True)
    entry_type: Mapped[FuelEntryType] = mapped_column(SAEnum(FuelEntryType), nullable=False, index=True)
    amount_liters: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    transport: Mapped[Transport] = relationship(back_populates="fuel_logs")


class TransportCheckIn(Base):
    __tablename__ = "transport_checkins"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("attendance_employees.id"), nullable=False, index=True)
    logistics_id: Mapped[int | None] = mapped_column(ForeignKey("logistics.id"), index=True)
    kind: Mapped[TransportCheckInKind] = mapped_column(SAEnum(TransportCheckInKind), nullable=False, index=True)
    odometer_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    odometer_photo_url: Mapped[str | None] = mapped_column(String(500))
    fuel_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_photo_url: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)

    transport: Mapped[Transport] = relationship(back_populates="check_ins")
    employee: Mapped[Employee] = relationship()
