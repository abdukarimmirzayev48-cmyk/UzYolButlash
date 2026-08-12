from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.attendance import HikvisionSyncLog
from backend.app.schemas.attendance import HikvisionAgentSyncRequest, HikvisionAgentSyncResult
from backend.app.services.auth import require_sync_agent_token
from backend.app.services.hikvision_sync import apply_events_to_attendance, merge_and_create_employees

# Not mounted with the app-level session `dependencies=authenticated` list in
# main.py (the LAN sync agent has no browser session) -- require_sync_agent_token
# is this router's only gate, checked per-route below.
router = APIRouter(prefix="/api/attendance/hikvision/agent", tags=["hikvision-agent"])


@router.post("/sync", response_model=HikvisionAgentSyncResult, dependencies=[Depends(require_sync_agent_token)])
def agent_sync(payload: HikvisionAgentSyncRequest, db: Session = Depends(get_db)):
    employees_result = merge_and_create_employees(db, payload.device_users)
    events_result = apply_events_to_attendance(db, payload.events)

    db.add(HikvisionSyncLog(
        source="agent",
        device_users_seen=employees_result.device_users,
        employees_created=employees_result.created,
        events_fetched=events_result.events_fetched,
        days_updated=events_result.days_updated,
        warnings_count=len(employees_result.warnings) + len(events_result.warnings),
    ))
    db.commit()

    return HikvisionAgentSyncResult(employees=employees_result, events=events_result)
