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
    late = "late"
    absent = "absent"
    day_off = "day_off"
    no_data = "no_data"


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
