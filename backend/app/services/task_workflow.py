from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.task import TASK_TERMINAL_STATUSES, Task, TaskComment, TaskHistory, TaskStatus
from backend.app.models.user import User
from backend.app.services import notifications

# new -> accepted -> in_progress -> done -> verified/rejected. Any transition
# not listed here is rejected outright (e.g. skipping straight from "new" to
# "done", or moving a terminal task anywhere).
ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.new: {TaskStatus.accepted},
    TaskStatus.accepted: {TaskStatus.in_progress},
    TaskStatus.in_progress: {TaskStatus.done},
    TaskStatus.done: {TaskStatus.verified, TaskStatus.rejected},
}

# These transitions must carry a comment (the "why" -- done needs a summary,
# rejected needs a reason).
COMMENT_REQUIRED_TRANSITIONS = {
    (TaskStatus.in_progress, TaskStatus.done),
    (TaskStatus.done, TaskStatus.rejected),
}

# Only the creator or an "ijro" manager may verify/reject a done task --
# assignees can't self-approve their own work.
MANAGER_ONLY_TRANSITIONS = {
    (TaskStatus.done, TaskStatus.verified),
    (TaskStatus.done, TaskStatus.rejected),
}


def is_manager(user: User) -> bool:
    return user.is_admin or "ijro" in (user.edit_modules or [])


def is_assignee(task: Task, user: User) -> bool:
    return any(assignee.employee.user_id == user.id for assignee in task.assignees)


def can_transition(task: Task, user: User, new_status: TaskStatus) -> bool:
    transition = (task.status, new_status)
    if transition in MANAGER_ONLY_TRANSITIONS:
        return is_manager(user) or task.created_by_user_id == user.id
    return is_manager(user) or is_assignee(task, user)


def available_actions(task: Task, user: User) -> list[str]:
    return [s.value for s in ALLOWED_TRANSITIONS.get(task.status, set()) if can_transition(task, user, s)]


def transition_task_status(db: Session, task: Task, new_status: TaskStatus, comment: str | None, user: User) -> Task:
    old_status = task.status
    if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bu holatga o'tish mumkin emas.")

    if not can_transition(task, user, new_status):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")

    comment = (comment or "").strip() or None
    if (old_status, new_status) in COMMENT_REQUIRED_TRANSITIONS and not comment:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bu amal uchun izoh/sabab kiritilishi shart.")

    task.status = new_status
    if new_status == TaskStatus.done:
        task.completed_at = datetime.now()
    if new_status in TASK_TERMINAL_STATUSES:
        task.closed_at = datetime.now()
    if new_status == TaskStatus.accepted:
        for assignee in task.assignees:
            if assignee.employee.user_id == user.id and assignee.accepted_at is None:
                assignee.accepted_at = datetime.now()
                assignee.accepted_by_user_id = user.id

    db.add(TaskHistory(task_id=task.id, user_id=user.id, action="status_changed", old_value=old_status.value, new_value=new_status.value))
    if comment:
        db.add(TaskComment(task_id=task.id, author_user_id=user.id, text=comment))
    db.commit()
    db.refresh(task)

    notify_task_participants(
        db,
        task,
        title=f"Topshiriq holati o'zgardi: {task.title}",
        body=f"{old_status.value} -> {new_status.value}",
        kind="status_changed",
        exclude_user_id=user.id,
    )
    return task


def notify_task_participants(db: Session, task: Task, title: str, body: str | None, kind: str, exclude_user_id: int | None = None) -> None:
    recipients = {assignee.employee.user_id for assignee in task.assignees if assignee.employee.user_id}
    recipients.add(task.created_by_user_id)
    recipients.discard(exclude_user_id)
    for user_id in recipients:
        notifications.notify(db, user_id=user_id, title=title, body=body, kind=kind, task_id=task.id)


def record_field_change(db: Session, task: Task, user: User, action: str, old_value: str | None, new_value: str | None) -> None:
    if old_value == new_value:
        return
    db.add(TaskHistory(task_id=task.id, user_id=user.id, action=action, old_value=old_value, new_value=new_value))
