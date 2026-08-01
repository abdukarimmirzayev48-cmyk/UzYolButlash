from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.task import Task, TaskStatus
from backend.app.schemas.client import Page
from backend.app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from backend.app.services.auth import require_edit

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Topshiriq topilmadi")
    return task


@router.get("", response_model=Page[TaskRead])
def list_tasks(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    assigned_employee_id: int | None = None,
    overdue_only: bool = False,
):
    stmt = select(Task)
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(Task.title.ilike(value), Task.description.ilike(value)))
    if status_filter:
        filters.append(Task.status == status_filter)
    if priority:
        filters.append(Task.priority == priority)
    if assigned_employee_id:
        filters.append(Task.assigned_employee_id == assigned_employee_id)
    if overdue_only:
        filters.append(Task.status.notin_([TaskStatus.done, TaskStatus.cancelled]))
        filters.append(Task.deadline < datetime.now())
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Task.deadline.asc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("ijro"))])
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    if payload.deadline < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Muddat o'tgan sana bo'lishi mumkin emas. Kelajakdagi sana va vaqtni tanlang.",
        )
    task = Task(**payload.model_dump(), status=TaskStatus.pending)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: int, db: Session = Depends(get_db)):
    return get_task_or_404(db, task_id)


@router.patch("/{task_id}", response_model=TaskRead, dependencies=[Depends(require_edit("ijro"))])
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data:
        new_status = data["status"]
        if new_status == TaskStatus.done and task.status != TaskStatus.done:
            data["completed_at"] = datetime.now()
        elif new_status != TaskStatus.done and task.status == TaskStatus.done:
            data["completed_at"] = None
    update_model(task, data)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("ijro"))])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
