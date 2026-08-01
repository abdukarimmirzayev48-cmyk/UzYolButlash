from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.task import TaskPriority, TaskStatus


class TaskEmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    department: str | None = None
    position: str | None = None


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    assigned_employee_id: int
    priority: TaskPriority = TaskPriority.medium
    deadline: datetime
    created_by: str | None = None
    note: str | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    assigned_employee_id: int | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    deadline: datetime | None = None
    created_by: str | None = None
    note: str | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: TaskStatus
    completed_at: datetime | None = None
    is_overdue: bool
    assigned_employee: TaskEmployeeSummary
    created_at: datetime
    updated_at: datetime
