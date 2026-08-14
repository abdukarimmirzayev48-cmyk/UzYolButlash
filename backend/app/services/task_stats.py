"""Aggregates for the Ijro dashboard.

Counting happens in Python over the already-filtered task rows rather than in
SQL. The task table is small (hundreds, not millions), the rows are loaded with
their assignees anyway, and this way the dashboard can't drift away from the
list: both start from exactly the same set of Task objects.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from backend.app.models.task import TASK_TERMINAL_STATUSES, Task, TaskPriority, TaskStatus

UPCOMING_DAYS = 7
TREND_MONTHS = 6
LIST_LIMIT = 10


def is_closed(task: Task) -> bool:
    return task.status in TASK_TERMINAL_STATUSES


def is_overdue(task: Task, now: datetime) -> bool:
    return not is_closed(task) and task.deadline is not None and task.deadline < now


def completed_on_time(task: Task) -> bool | None:
    """True/False for finished work, None while it is still running."""
    if task.completed_at is None or task.deadline is None:
        return None
    return task.completed_at <= task.deadline


def month_key(value: datetime | None) -> str | None:
    return f"{value.year:04d}-{value.month:02d}" if value else None


def recent_months(today: date, count: int = TREND_MONTHS) -> list[str]:
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(months))


def assignee_names(task: Task) -> str:
    return ", ".join(a.employee.full_name for a in task.assignees if a.employee)


def task_brief(task: Task, now: datetime) -> dict:
    days = (task.deadline.date() - now.date()).days if task.deadline else None
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status.value if hasattr(task.status, "value") else str(task.status),
        "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
        "deadline": task.deadline,
        "department": task.department.name if task.department else None,
        "assignees": assignee_names(task),
        "days_left": days,
    }


def build_dashboard(tasks: list[Task], now: datetime | None = None) -> dict:
    now = now or datetime.now()
    today = now.date()
    week_end = today + timedelta(days=UPCOMING_DAYS - 1)

    open_tasks = [t for t in tasks if not is_closed(t)]
    overdue = [t for t in open_tasks if is_overdue(t, now)]
    due_today = [t for t in open_tasks if t.deadline and t.deadline.date() == today]
    due_week = [t for t in open_tasks if t.deadline and today <= t.deadline.date() <= week_end]
    unaccepted = [t for t in tasks if t.status == TaskStatus.new]

    on_time_flags = [flag for flag in (completed_on_time(t) for t in tasks) if flag is not None]
    on_time_rate = round(sum(on_time_flags) / len(on_time_flags) * 100, 1) if on_time_flags else None

    durations = [
        (t.completed_at - t.created_at).total_seconds() / 86400
        for t in tasks
        if t.completed_at and t.created_at
    ]
    avg_days = round(sum(durations) / len(durations), 1) if durations else None

    status_counts = {s.value: 0 for s in TaskStatus}
    priority_counts = {p.value: 0 for p in TaskPriority}
    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1
        priority_counts[task.priority.value] = priority_counts.get(task.priority.value, 0) + 1

    departments: dict[tuple[int | None, str], dict] = defaultdict(
        lambda: {"total": 0, "open": 0, "overdue": 0, "completed": 0}
    )
    employees: dict[int, dict] = {}
    for task in tasks:
        key = (task.department_id, task.department.name if task.department else "Bo'limsiz")
        bucket = departments[key]
        bucket["total"] += 1
        if not is_closed(task):
            bucket["open"] += 1
        if is_overdue(task, now):
            bucket["overdue"] += 1
        if task.completed_at:
            bucket["completed"] += 1

        for assignee in task.assignees:
            employee = assignee.employee
            if not employee:
                continue
            row = employees.setdefault(
                employee.id,
                {
                    "employee_id": employee.id,
                    "full_name": employee.full_name,
                    "department": employee.department,
                    "total": 0,
                    "open": 0,
                    "overdue": 0,
                    "completed": 0,
                    "on_time": 0,
                },
            )
            row["total"] += 1
            if not is_closed(task):
                row["open"] += 1
            if is_overdue(task, now):
                row["overdue"] += 1
            if task.completed_at:
                row["completed"] += 1
                if completed_on_time(task):
                    row["on_time"] += 1

    months = recent_months(today)
    created_by_month = defaultdict(int)
    completed_by_month = defaultdict(int)
    for task in tasks:
        key = month_key(task.created_at)
        if key in months:
            created_by_month[key] += 1
        key = month_key(task.completed_at)
        if key in months:
            completed_by_month[key] += 1

    return {
        "summary": {
            "total": len(tasks),
            "open": len(open_tasks),
            "overdue": len(overdue),
            "due_today": len(due_today),
            "due_week": len(due_week),
            "unaccepted": len(unaccepted),
            "completed": status_counts.get(TaskStatus.done.value, 0) + status_counts.get(TaskStatus.verified.value, 0),
            "verified": status_counts.get(TaskStatus.verified.value, 0),
            "rejected": status_counts.get(TaskStatus.rejected.value, 0),
            "on_time_rate": on_time_rate,
            "avg_completion_days": avg_days,
        },
        "by_status": [{"status": key, "count": value} for key, value in status_counts.items()],
        "by_priority": [{"priority": key, "count": value} for key, value in priority_counts.items()],
        "by_department": sorted(
            [{"department_id": dept_id, "department": name, **values} for (dept_id, name), values in departments.items()],
            key=lambda row: (-row["total"], row["department"]),
        ),
        "by_employee": sorted(
            employees.values(), key=lambda row: (-row["overdue"], -row["open"], row["full_name"])
        ),
        "monthly": [
            {"month": m, "created": created_by_month.get(m, 0), "completed": completed_by_month.get(m, 0)}
            for m in months
        ],
        "overdue_tasks": [
            task_brief(t, now)
            for t in sorted(overdue, key=lambda t: t.deadline or datetime.max)[:LIST_LIMIT]
        ],
        "upcoming_tasks": [
            task_brief(t, now)
            for t in sorted(due_week, key=lambda t: t.deadline or datetime.max)[:LIST_LIMIT]
        ],
    }
