"""Filtering and sorting shared by the task list, the dashboard and the export.

All three must agree on what "the current selection" means -- what you see in
the table has to be what the dashboard counts and what lands in the Excel file.
Keeping the clause builder in one place is what guarantees that.
"""

from dataclasses import dataclass
from datetime import date, datetime, time

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.attendance import Employee
from backend.app.models.task import TASK_TERMINAL_STATUSES, Task, TaskAssignee
from backend.app.models.user import User

SORTABLE_COLUMNS = {
    "deadline": Task.deadline,
    "created_at": Task.created_at,
    "title": Task.title,
    "status": Task.status,
    "priority": Task.priority,
}

# Ranked so "highest first" means most urgent first, which is what a priority
# sort is for -- the enum's alphabetical order would put "urgent" in the middle.
PRIORITY_RANK = {"urgent": 4, "high": 3, "medium": 2, "low": 1}


@dataclass
class TaskFilters:
    search: str | None = None
    status: str | None = None
    priority: str | None = None
    department_id: int | None = None
    assigned_employee_id: int | None = None
    overdue_only: bool = False
    state: str | None = None  # open | closed
    mine: str | None = None  # assigned | created
    deadline_from: date | None = None
    deadline_to: date | None = None
    created_from: date | None = None
    created_to: date | None = None
    sort: str = "deadline"
    order: str = "asc"


def current_user_employee_id(db: Session, user: User) -> int | None:
    return db.query(Employee.id).filter(Employee.user_id == user.id).scalar()


def filter_clauses(db: Session, filters: TaskFilters, user: User) -> list:
    clauses = []
    if filters.search:
        value = f"%{filters.search}%"
        clauses.append(or_(Task.title.ilike(value), Task.description.ilike(value)))
    if filters.status:
        clauses.append(Task.status == filters.status)
    if filters.priority:
        clauses.append(Task.priority == filters.priority)
    if filters.department_id:
        clauses.append(Task.department_id == filters.department_id)
    if filters.assigned_employee_id:
        clauses.append(Task.assignees.any(TaskAssignee.employee_id == filters.assigned_employee_id))
    if filters.state == "open":
        clauses.append(Task.status.notin_(TASK_TERMINAL_STATUSES))
    elif filters.state == "closed":
        clauses.append(Task.status.in_(TASK_TERMINAL_STATUSES))
    if filters.overdue_only:
        clauses.append(Task.status.notin_(TASK_TERMINAL_STATUSES))
        clauses.append(Task.deadline < datetime.now())
    if filters.mine == "created":
        clauses.append(Task.created_by_user_id == user.id)
    elif filters.mine == "assigned":
        employee_id = current_user_employee_id(db, user)
        # No linked employee card means no assigned tasks -- match nothing
        # rather than silently falling back to "everything".
        clauses.append(
            Task.assignees.any(TaskAssignee.employee_id == employee_id) if employee_id else Task.id.is_(None)
        )
    if filters.deadline_from:
        clauses.append(Task.deadline >= datetime.combine(filters.deadline_from, time.min))
    if filters.deadline_to:
        clauses.append(Task.deadline <= datetime.combine(filters.deadline_to, time.max))
    if filters.created_from:
        clauses.append(Task.created_at >= datetime.combine(filters.created_from, time.min))
    if filters.created_to:
        clauses.append(Task.created_at <= datetime.combine(filters.created_to, time.max))
    return clauses


def apply_sort(stmt, filters: TaskFilters):
    descending = (filters.order or "asc").lower() == "desc"
    if filters.sort == "priority":
        # SQLite has no enum ordering, so rank explicitly.
        case_expr = Task.priority
        ordered = sorted(PRIORITY_RANK, key=PRIORITY_RANK.get, reverse=not descending)
        from sqlalchemy import case

        rank = case({name: index for index, name in enumerate(ordered)}, value=case_expr, else_=len(ordered))
        return stmt.order_by(rank, Task.deadline.asc())
    column = SORTABLE_COLUMNS.get(filters.sort or "deadline", Task.deadline)
    return stmt.order_by(column.desc() if descending else column.asc(), Task.id.asc())
