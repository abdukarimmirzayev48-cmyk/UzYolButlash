from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin
from backend.app.models.user import User


class AttendanceStatus(str, Enum):
    on_time = "on_time"
    late = "late"  # Сабабсиз — late without a valid reason (the penalized variant)
    late_excused = "late_excused"  # Сабабли — late for a valid reason
    absent = "absent"  # НБ
    study_leave = "study_leave"  # Ўқув таътили
    labor_leave = "labor_leave"  # Меҳнат таътилида
    unpaid_leave = "unpaid_leave"  # Бс — таътил
    sick_leave = "sick_leave"  # Бл — касаллик варақасида
    business_trip = "business_trip"  # Хс — хизмат сафарида
    day_off = "day_off"
    no_data = "no_data"


# Excused whole-day absences: the person is legitimately away, so these never
# count as absence and never reduce the discipline score.
LEAVE_STATUSES = frozenset({
    AttendanceStatus.study_leave,
    AttendanceStatus.labor_leave,
    AttendanceStatus.unpaid_leave,
    AttendanceStatus.sick_leave,
    AttendanceStatus.business_trip,
})

# Statuses only a human ever sets. The Hikvision sync must not overwrite these:
# otherwise a re-sync/backfill would silently wipe a manually marked vacation or
# sick day as soon as that person has any badge event on that date.
MANUAL_STATUSES = LEAVE_STATUSES | frozenset({
    AttendanceStatus.late_excused,
    AttendanceStatus.day_off,
    AttendanceStatus.absent,
})


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    employees: Mapped[list["Employee"]] = relationship(back_populates="department_ref")


class Employee(Base, TimestampMixin):
    __tablename__ = "attendance_employees"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    position: Mapped[str | None] = mapped_column(String(255))
    department: Mapped[str | None] = mapped_column(String(255), index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), index=True)
    badge_number: Mapped[str | None] = mapped_column(String(64), index=True, unique=True)
    scheduled_check_in: Mapped[time] = mapped_column(Time, default=time(9, 0), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    telegram_pairing_code: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    telegram_pairing_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime)

    department_ref: Mapped[Department | None] = relationship(back_populates="employees")
    user: Mapped[User | None] = relationship()
    records: Mapped[list["AttendanceRecord"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan", order_by="AttendanceRecord.work_date"
    )


class AttendanceRecord(Base, TimestampMixin):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("attendance_employees.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_in_time: Mapped[time | None] = mapped_column(Time)
    check_out_time: Mapped[time | None] = mapped_column(Time)
    status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(AttendanceStatus), default=AttendanceStatus.no_data, nullable=False
    )
    late_minutes: Mapped[int] = mapped_column(default=0, nullable=False)
    early_leave: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    disciplinary_violation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    absence_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)

    employee: Mapped[Employee] = relationship(back_populates="records")


class HikvisionSyncLog(Base):
    """One row per completed sync run (currently: the unattended LAN agent),
    so office staff can see whether/when the last automatic sync happened
    without needing server/log access."""

    __tablename__ = "hikvision_sync_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="agent")
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)
    device_users_seen: Mapped[int] = mapped_column(default=0, nullable=False)
    employees_created: Mapped[int] = mapped_column(default=0, nullable=False)
    events_fetched: Mapped[int] = mapped_column(default=0, nullable=False)
    days_updated: Mapped[int] = mapped_column(default=0, nullable=False)
    warnings_count: Mapped[int] = mapped_column(default=0, nullable=False)
