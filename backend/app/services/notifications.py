from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.app.models.task import TASK_TERMINAL_STATUSES, Notification, Task


def notify(
    db: Session,
    user_id: int,
    title: str,
    body: str | None,
    kind: str,
    task_id: int | None = None,
    link_path: str | None = None,
) -> Notification:
    notification = Notification(user_id=user_id, task_id=task_id, link_path=link_path, title=title, body=body, kind=kind)
    db.add(notification)
    db.commit()
    return notification


def has_notification(db: Session, task_id: int, user_id: int, kind: str) -> bool:
    return (
        db.query(Notification.id)
        .filter(Notification.task_id == task_id, Notification.user_id == user_id, Notification.kind == kind)
        .first()
        is not None
    )


def _notify_once(db: Session, task: Task, user_ids: set[int | None], kind: str, title: str) -> None:
    for user_id in user_ids:
        if user_id is not None and not has_notification(db, task.id, user_id, kind):
            notify(db, user_id, title, None, kind, task.id)


def run_reminder_sweep(db: Session) -> None:
    """Deadline reminders (1 day / 1 hour out) and an overdue sweep for non-terminal tasks.

    Idempotent: dedups against existing Notification rows of the same kind for
    the same task+user, so calling this repeatedly (the real use case, run on
    a schedule) never creates duplicates.
    """
    now = datetime.now()
    tasks = db.query(Task).filter(Task.status.notin_(TASK_TERMINAL_STATUSES)).all()
    for task in tasks:
        assignee_user_ids = {assignee.employee.user_id for assignee in task.assignees if assignee.employee.user_id}
        if task.deadline < now:
            _notify_once(db, task, assignee_user_ids | {task.created_by_user_id}, "overdue", f"Muddati o'tib ketdi: {task.title}")
        elif task.deadline <= now + timedelta(hours=1):
            _notify_once(db, task, assignee_user_ids, "reminder_1h", f"1 soatdan keyin muddati tugaydi: {task.title}")
        elif task.deadline <= now + timedelta(hours=24):
            _notify_once(db, task, assignee_user_ids, "reminder_1d", f"Ertaga muddati tugaydi: {task.title}")
