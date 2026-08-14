from datetime import date, datetime
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.paths import UPLOADS_DIR
from backend.app.db.session import get_db
from backend.app.models.attendance import Employee
from backend.app.models.task import (
    TASK_TERMINAL_STATUSES,
    Notification,
    Task,
    TaskAssignee,
    TaskAttachment,
    TaskComment,
    TaskHistory,
    TaskStatus,
)
from backend.app.models.user import User
from backend.app.schemas.client import Page
from backend.app.schemas.task import (
    TaskAttachmentRead,
    TaskCommentRead,
    TaskCreate,
    TaskDetail,
    TaskRead,
    TaskStatusUpdate,
    TaskUpdate,
)
from backend.app.services import task_export, task_query, task_stats, task_workflow
from backend.app.services.task_query import TaskFilters
from backend.app.services.auth import get_current_user, require_edit

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

UPLOAD_DIR = UPLOADS_DIR / "tasks"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

TASK_OPTIONS = (
    selectinload(Task.assignees).selectinload(TaskAssignee.employee),
    selectinload(Task.assignees).selectinload(TaskAssignee.accepted_by_user),
    selectinload(Task.department),
    selectinload(Task.created_by_user),
    selectinload(Task.comments).selectinload(TaskComment.author),
    selectinload(Task.comments).selectinload(TaskComment.attachments).selectinload(TaskAttachment.uploaded_by),
    selectinload(Task.attachments).selectinload(TaskAttachment.uploaded_by),
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


def store_task_upload(file: UploadFile) -> tuple[str, int]:
    """Save an upload and return its public url plus size, refusing oversized files.

    The size is counted while copying rather than trusted from the request, so a
    lying Content-Length cannot slip a huge file onto disk.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    written = 0
    try:
        with destination.open("wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Fayl juda katta: {safe_name}. Har bir fayl 10 MB dan oshmasligi kerak.",
                    )
                buffer.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return f"/static/uploads/tasks/{stored_name}", written


def save_attachments(
    db: Session,
    task: Task,
    files: list[UploadFile],
    user: User,
    comment_id: int | None = None,
) -> list[TaskAttachment]:
    saved: list[TaskAttachment] = []
    for upload in files:
        if not (upload and upload.filename):
            continue
        file_url, size = store_task_upload(upload)
        attachment = TaskAttachment(
            task_id=task.id,
            comment_id=comment_id,
            uploaded_by_user_id=user.id,
            file_url=file_url,
            file_name=Path(upload.filename).name,
            content_type=upload.content_type,
            size_bytes=size,
        )
        db.add(attachment)
        saved.append(attachment)
    return saved


def remove_stored_file(file_url: str) -> None:
    """Delete the file behind an attachment, but never outside the uploads dir."""
    path = (UPLOAD_DIR / Path(file_url).name).resolve()
    if path.parent == UPLOAD_DIR.resolve():
        path.unlink(missing_ok=True)


def require_task_participant(task: Task, user: User) -> None:
    if not (task_workflow.is_manager(user) or task_workflow.is_assignee(task, user) or task.created_by_user_id == user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")


EXPORT_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def collect_filters(
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    assigned_employee_id: int | None = None,
    department_id: int | None = None,
    overdue_only: bool = False,
    state: str | None = Query(default=None, pattern="^(open|closed)$"),
    mine: str | None = Query(default=None, pattern="^(assigned|created)$"),
    deadline_from: date | None = None,
    deadline_to: date | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    sort: str = Query(default="deadline"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
) -> TaskFilters:
    return TaskFilters(
        search=search,
        status=status_filter,
        priority=priority,
        department_id=department_id,
        assigned_employee_id=assigned_employee_id,
        overdue_only=overdue_only,
        state=state,
        mine=mine,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        created_from=created_from,
        created_to=created_to,
        sort=sort,
        order=order,
    )


def filtered_tasks(db: Session, filters: TaskFilters, user: User) -> list[Task]:
    stmt = select(Task).options(*TASK_OPTIONS)
    clauses = task_query.filter_clauses(db, filters, user)
    if clauses:
        stmt = stmt.where(*clauses)
    return list(db.scalars(task_query.apply_sort(stmt, filters)).all())


@router.get("", response_model=Page[TaskRead])
def list_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    filters: TaskFilters = Depends(collect_filters),
):
    stmt = select(Task)
    clauses = task_query.filter_clauses(db, filters, user)
    if clauses:
        stmt = stmt.where(*clauses)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        task_query.apply_sort(stmt.options(*TASK_OPTIONS), filters).offset((page - 1) * page_size).limit(page_size)
    ).all()
    for row in rows:
        row.available_actions = task_workflow.available_actions(row, user)
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.get("/dashboard")
def tasks_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: TaskFilters = Depends(collect_filters),
):
    return task_stats.build_dashboard(filtered_tasks(db, filters, user))


@router.get("/export.xlsx")
def export_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    filters: TaskFilters = Depends(collect_filters),
    lang: str = Query(default="cyr"),
    filter_note: str = Query(default="", max_length=500),
):
    tasks = filtered_tasks(db, filters, user)
    stream = task_export.build_workbook(tasks, task_stats.build_dashboard(tasks), lang, filter_note)
    filename = f"topshiriqlar_{date.today():%Y-%m-%d}.xlsx"
    return StreamingResponse(
        stream,
        media_type=EXPORT_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}; filename*=UTF-8''{quote(filename)}"},
    )


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


@router.post("/{task_id}/attachments", response_model=TaskDetail, status_code=status.HTTP_201_CREATED)
def add_task_attachments(
    task_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    require_task_participant(task, user)

    saved = save_attachments(db, task, files, user)
    if not saved:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fayl tanlanmadi.")
    db.add(
        TaskHistory(
            task_id=task.id,
            user_id=user.id,
            action="files_added",
            old_value=None,
            new_value=", ".join(a.file_name for a in saved),
        )
    )
    db.commit()

    task = get_task_or_404(db, task_id)
    task_workflow.notify_task_participants(
        db,
        task,
        title=f"Yangi fayl: {task.title}",
        body=", ".join(a.file_name for a in saved),
        kind="file_added",
        exclude_user_id=user.id,
    )
    return get_task_or_404(db, task_id, user)


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_attachment(task_id: int, attachment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attachment = db.get(TaskAttachment, attachment_id)
    if not attachment or attachment.task_id != task_id:
        raise HTTPException(status_code=404, detail="Fayl topilmadi")
    if attachment.uploaded_by_user_id != user.id and not task_workflow.is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")
    file_url = attachment.file_url
    db.delete(attachment)
    db.commit()
    remove_stored_file(file_url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/comments", response_model=TaskCommentRead, status_code=status.HTTP_201_CREATED)
def add_task_comment(
    task_id: int,
    text: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    require_task_participant(task, user)

    clean_text = (text or "").strip() or None
    uploads = [f for f in files if f and f.filename]
    if not clean_text and not uploads:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Izoh matni yoki fayl kiritilishi shart.")

    comment = TaskComment(task_id=task.id, author_user_id=user.id, text=clean_text)
    db.add(comment)
    db.flush()
    save_attachments(db, task, uploads, user, comment_id=comment.id)
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
    file_urls = [a.file_url for a in comment.attachments]
    db.delete(comment)
    db.commit()
    for file_url in file_urls:
        remove_stored_file(file_url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("ijro"))])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    file_urls = [a.file_url for a in task.attachments]
    db.query(Notification).filter(Notification.task_id == task_id).delete(synchronize_session=False)
    db.delete(task)
    db.commit()
    for file_url in file_urls:
        remove_stored_file(file_url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
