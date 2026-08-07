from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.task import TaskPriority, TaskStatus


class TaskEmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    department: str | None = None
    position: str | None = None


class TaskUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class TaskDepartmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TaskAssigneeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee: TaskEmployeeSummary
    accepted_at: datetime | None = None
    accepted_by_user: TaskUserSummary | None = None


class TaskCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: TaskUserSummary
    text: str | None = None
    attachment_url: str | None = None
    created_at: datetime


class TaskHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user: TaskUserSummary
    action: str
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority = TaskPriority.medium
    deadline: datetime
    created_by: str | None = None
    department_id: int | None = None


class TaskCreate(TaskBase):
    assignee_employee_ids: list[int] = Field(min_length=1)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority | None = None
    deadline: datetime | None = None
    created_by: str | None = None
    department_id: int | None = None
    assignee_employee_ids: list[int] | None = Field(default=None, min_length=1)


class TaskStatusUpdate(BaseModel):
    status: TaskStatus
    comment: str | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: TaskStatus
    completed_at: datetime | None = None
    closed_at: datetime | None = None
    is_overdue: bool
    assignees: list[TaskAssigneeRead] = Field(default_factory=list)
    department: TaskDepartmentSummary | None = None
    created_by_user: TaskUserSummary
    available_actions: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TaskDetail(TaskRead):
    comments: list[TaskCommentRead] = Field(default_factory=list)
    history: list[TaskHistoryRead] = Field(default_factory=list)


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int | None = None
    link_path: str | None = None
    title: str
    body: str | None = None
    kind: str
    is_read: bool
    created_at: datetime


class NotificationUpdate(BaseModel):
    is_read: bool
