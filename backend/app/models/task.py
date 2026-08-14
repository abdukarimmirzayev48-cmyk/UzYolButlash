from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.attendance import Department, Employee
from backend.app.models.client import TimestampMixin
from backend.app.models.user import User


class TaskStatus(str, Enum):
    new = "new"
    accepted = "accepted"
    in_progress = "in_progress"
    done = "done"
    verified = "verified"
    rejected = "rejected"


TASK_TERMINAL_STATUSES = (TaskStatus.verified, TaskStatus.rejected)


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority), default=TaskPriority.medium, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), default=TaskStatus.new, nullable=False, index=True)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_by_user: Mapped[User] = relationship(foreign_keys=[created_by_user_id])
    department: Mapped[Department | None] = relationship()
    assignees: Mapped[list["TaskAssignee"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    comments: Mapped[list["TaskComment"]] = relationship(back_populates="task", cascade="all, delete-orphan", order_by="TaskComment.created_at")
    attachments: Mapped[list["TaskAttachment"]] = relationship(back_populates="task", cascade="all, delete-orphan", order_by="TaskAttachment.id")
    history: Mapped[list["TaskHistory"]] = relationship(back_populates="task", cascade="all, delete-orphan", order_by="TaskHistory.created_at")

    @property
    def attachment_count(self) -> int:
        """Files attached to the task itself; comment files are counted with their comment."""
        return sum(1 for a in self.attachments if a.comment_id is None)

    @property
    def is_overdue(self) -> bool:
        return self.status not in TASK_TERMINAL_STATUSES and self.deadline < datetime.now()


class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "employee_id", name="uq_task_assignee"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("attendance_employees.id"), nullable=False, index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    accepted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    task: Mapped[Task] = relationship(back_populates="assignees")
    employee: Mapped[Employee] = relationship()
    accepted_by_user: Mapped[User | None] = relationship(foreign_keys=[accepted_by_user_id])


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str | None] = mapped_column(Text)
    attachment_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
    attachments: Mapped[list["TaskAttachment"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan", order_by="TaskAttachment.id"
    )


class TaskAttachment(Base):
    """A file on a task.

    comment_id is null for files attached to the task itself (the brief, specs)
    and set for files posted with a comment, so one table serves both places.
    """

    __tablename__ = "task_attachments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("task_comments.id", ondelete="CASCADE"), index=True)
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    task: Mapped[Task] = relationship(back_populates="attachments")
    comment: Mapped[TaskComment | None] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User] = relationship()

    @property
    def is_image(self) -> bool:
        return bool(self.content_type and self.content_type.startswith("image/"))


class TaskHistory(Base):
    __tablename__ = "task_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[str | None] = mapped_column(String(255))
    new_value: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    task: Mapped[Task] = relationship(back_populates="history")
    user: Mapped[User] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    link_path: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)

    user: Mapped[User] = relationship()
    task: Mapped[Task | None] = relationship()
