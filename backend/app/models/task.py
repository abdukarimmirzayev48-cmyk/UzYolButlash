from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.attendance import Employee
from backend.app.models.client import TimestampMixin


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    assigned_employee_id: Mapped[int] = mapped_column(ForeignKey("attendance_employees.id"), nullable=False, index=True)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority), default=TaskPriority.medium, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.pending, nullable=False, index=True)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    note: Mapped[str | None] = mapped_column(Text)

    assigned_employee: Mapped[Employee] = relationship()

    @property
    def is_overdue(self) -> bool:
        return self.status not in (TaskStatus.done, TaskStatus.cancelled) and self.deadline < datetime.now()
