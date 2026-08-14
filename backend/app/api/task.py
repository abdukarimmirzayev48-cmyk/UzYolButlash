from datetime import datetime
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.paths import UPLOADS_DIR
from backend.app.db.session import get_db
from backend.app.models.attendance import Employee
from backend.app.models.task import TASK_TERMINAL_STATUSES, Notification, Task, TaskAssignee, TaskComment, TaskHistory, TaskStatus
from backend.app.models.user import User
from backend.app.schemas.client import Page
from backend.app.schemas.task import TaskCommentRead, TaskCreate, TaskDetail, TaskRead, TaskStatusUpdate, TaskUpdate
from backend.app.services import task_workflow
from backend.app.services.auth import get_current_user, require_edit

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

UPLOAD_DIR = UPLOADS_DIR / "tasks"

TASK_OPTIONS = (
    selectinload(Task.assignees).selectinload(TaskAssignee.employee),
    selectinload(Task.assignees).selectinload(TaskAssignee.accepted_by_user),
    selectinload(Task.department),
    selectinload(Task.created_by_user),
    selectinload(Task.comments).selectinload(TaskComment.author),
    selectinload(Task.history).selectinload(TaskHistory.user),
)


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_task_or_404(db: Session, task_id: int, user: User | None = None) -> Task:
    task = db.scalars(select(Task).options(*TASK_OPTIONS).where(Task.id == task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Topshiriq topilmadi")
    if user is not None:
        task.available_actions = task_workflow.available_actions(task, user)
    return task


def validate_employee_ids(db: Session, employee_ids: list[int]) -> None:
    ids = set(employee_ids)
    found = set(db.scalars(select(Employee.id).where(Employee.id.in_(ids))))
    missing = ids - found
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Noma'lum xodim id: {', '.join(str(i) for i in sorted(missing))}",
        )


def store_task_upload(file: UploadFile) -> str:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    with destination.open("wb") as buffer:
        copyfileobj(file.file, buffer)
    return f"/static/uploads/tasks/{stored_name}"


@router.get("", response_model=Page[TaskRead])
def list_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    assigned_employee_id: int | None = None,
    department_id: int | None = None,
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
    if department_id:
        filters.append(Task.department_id == department_id)
    if assigned_employee_id:
        filters.append(Task.assignees.any(TaskAssignee.employee_id == assigned_employee_id))
    if overdue_only:
        filters.append(Task.status.notin_(TASK_TERMINAL_STATUSES))
        filters.append(Task.deadline < datetime.now())
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.options(*TASK_OPTIONS).order_by(Task.deadline.asc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    for row in rows:
        row.available_actions = task_workflow.available_actions(row, user)
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("", response_model=TaskDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("ijro"))])
def create_task(payload: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.deadline < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Muddat o'tgan sana bo'lishi mumkin emas. Kelajakdagi sanani tanlang.",
        )
    validate_employee_ids(db, payload.assignee_employee_ids)

    data = payload.model_dump(exclude={"assignee_employee_ids"})
    task = Task(**data, status=TaskStatus.new, created_by_user_id=user.id)
    db.add(task)
    db.flush()
    for employee_id in payload.assignee_employee_ids:
        db.add(TaskAssignee(task_id=task.id, employee_id=employee_id))
    db.add(TaskHistory(task_id=task.id, user_id=user.id, action="created", old_value=None, new_value=TaskStatus.new.value))
    db.commit()

    task = get_task_or_404(db, task.id)
    task_workflow.notify_task_participants(
        db, task, title=f"Sizga yangi topshiriq biriktirildi: {task.title}", body=task.description, kind="assigned", exclude_user_id=user.id
    )
    return get_task_or_404(db, task.id, user)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_task_or_404(db, task_id, user)


@router.patch("/{task_id}", response_model=TaskDetail, dependencies=[Depends(require_edit("ijro"))])
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = get_task_or_404(db, task_id, user)
    data = payload.model_dump(exclude_unset=True, exclude={"assignee_employee_ids"})

    if "deadline" in data and data["deadline"] != task.deadline:
        old = task.deadline.isoformat() if task.deadline else None
        new = data["deadline"].isoformat() if data["deadline"] else None
        task_workflow.record_field_change(db, task, user, "deadline_changed", old, new)

    if payload.assignee_employee_ids is not None:
        validate_employee_ids(db, payload.assignee_employee_ids)
        old_ids = sorted(a.employee_id for a in task.assignees)
        new_ids = sorted(set(payload.assignee_employee_ids))
        if old_ids != new_ids:
            for assignee in list(task.assignees):
                if assignee.employee_id not in new_ids:
                    db.delete(assignee)
            for employee_id in new_ids:
                if employee_id not in old_ids:
                    db.add(TaskAssignee(task_id=task.id, employee_id=employee_id))
            task_workflow.record_field_change(
                db, task, user, "assignees_changed", ",".join(str(i) for i in old_ids), ",".join(str(i) for i in new_ids)
            )

    update_model(task, data)
    db.commit()
    return get_task_or_404(db, task_id, user)


@router.post("/{task_id}/status", response_model=TaskDetail)
def update_task_status(task_id: int, payload: TaskStatusUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = get_task_or_404(db, task_id, user)
    task_workflow.transition_task_status(db, task, payload.status, payload.comment, user)
    return get_task_or_404(db, task_id, user)


@router.post("/{task_id}/comments", response_model=TaskCommentRead, status_code=status.HTTP_201_CREATED)
def add_task_comment(
    task_id: int,
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    if not (task_workflow.is_manager(user) or task_workflow.is_assignee(task, user) or task.created_by_user_id == user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")

    clean_text = (text or "").strip() or None
    has_file = bool(file and file.filename)
    if not clean_text and not has_file:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Izoh matni yoki fayl kiritilishi shart.")

    comment = TaskComment(
        task_id=task.id,
        author_user_id=user.id,
        text=clean_text,
        attachment_url=store_task_upload(file) if has_file else None,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    task_workflow.notify_task_participants(
        db, task, title=f"Yangi izoh: {task.title}", body=clean_text, kind="comment_added", exclude_user_id=user.id
    )
    return comment


@router.delete("/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_comment(task_id: int, comment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    comment = db.get(TaskComment, comment_id)
    if not comment or comment.task_id != task_id:
        raise HTTPException(status_code=404, detail="Izoh topilmadi")
    if comment.author_user_id != user.id and not task_workflow.is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("ijro"))])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    db.query(Notification).filter(Notification.task_id == task_id).delete(synchronize_session=False)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
