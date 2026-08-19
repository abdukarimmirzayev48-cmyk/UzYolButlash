from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.audit import AuditLog
from backend.app.models.user import User
from backend.app.services.auth import require_admin

router = APIRouter(prefix="/api/audit-log", tags=["audit-log"])

# Action keys only. The wording lives in the frontend, where the Cyrillic
# string extractor can reach it -- labels returned from Python would stay Latin.
def serialize(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "created_at": row.created_at,
        "user_id": row.user_id,
        "username": row.username,
        "full_name": row.full_name,
        "method": row.method,
        "path": row.path,
        "module": row.module,
        "action": row.action,
        "record_id": row.record_id,
        "status_code": row.status_code,
        "duration_ms": row.duration_ms,
        "ip_address": row.ip_address,
        # A 4xx/5xx row is an attempt that did not take effect -- worth seeing,
        # but it must never be read as a completed action.
        "succeeded": row.status_code < 400,
    }


@router.get("", dependencies=[Depends(require_admin)])
def list_audit_log(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: int | None = None,
    module: str | None = None,
    action: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    failed_only: bool = False,
):
    stmt = select(AuditLog)
    filters = []
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if module:
        filters.append(AuditLog.module == module)
    if action:
        filters.append(AuditLog.action == action)
    if failed_only:
        filters.append(AuditLog.status_code >= 400)
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(AuditLog.created_at <= datetime.combine(date_to, time.max))
    if search:
        value = f"%{search}%"
        filters.append(or_(AuditLog.path.ilike(value), AuditLog.username.ilike(value), AuditLog.full_name.ilike(value)))
    if filters:
        stmt = stmt.where(*filters)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": [serialize(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/filters", dependencies=[Depends(require_admin)])
def audit_filters(db: Session = Depends(get_db)):
    """Only the users, modules and actions that actually appear in the log."""
    modules = [m for m in db.scalars(select(AuditLog.module).distinct().order_by(AuditLog.module)) if m]
    actions = [a for a in db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action)) if a]
    user_ids = [u for u in db.scalars(select(AuditLog.user_id).distinct()) if u]
    users = db.scalars(select(User).where(User.id.in_(user_ids)).order_by(User.full_name)).all() if user_ids else []
    return {
        "modules": modules,
        "actions": actions,
        "users": [{"id": u.id, "name": u.full_name or u.username} for u in users],
    }


@router.get("/summary", dependencies=[Depends(require_admin)])
def audit_summary(db: Session = Depends(get_db), days: int = Query(30, ge=1, le=365)):
    since = datetime.combine(date.today(), time.min) - __import__("datetime").timedelta(days=days - 1)
    base = select(AuditLog).where(AuditLog.created_at >= since).subquery()
    total = db.scalar(select(func.count()).select_from(base)) or 0
    failed = db.scalar(select(func.count()).select_from(base).where(base.c.status_code >= 400)) or 0
    by_user = db.execute(
        select(base.c.full_name, base.c.username, func.count())
        .group_by(base.c.user_id)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    by_module = db.execute(
        select(base.c.module, func.count()).group_by(base.c.module).order_by(func.count().desc()).limit(10)
    ).all()
    return {
        "days": days,
        "total": total,
        "failed": failed,
        "by_user": [{"name": name or username or "—", "count": count} for name, username, count in by_user],
        "by_module": [{"module": module or "—", "count": count} for module, count in by_module],
    }
