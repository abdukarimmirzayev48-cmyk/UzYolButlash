from datetime import date as date_cls, time as time_cls

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.attendance import AttendanceRecord, Employee
from backend.app.schemas.attendance import HikvisionEmployeeSyncResult, HikvisionEventSyncResult
from backend.app.services.attendance_scoring import apply_record_fields
from backend.app.services.hikvision_client import parse_device_time

# Shared by both the browser-triggered sync (backend calls the devices
# directly — only works when the backend process itself is on the same LAN
# as the turnstiles) and the LAN-side sync agent (backend/app/api/hikvision_agent.py
# — the agent calls the devices and forwards the raw results here). Neither
# caller needs to know anything about badge-matching/upsert details; they
# just hand over whatever raw device_users/events they collected.


def merge_and_create_employees(db: Session, device_users: list[dict]) -> HikvisionEmployeeSyncResult:
    """Dedupe device users by badge number and create any missing Employee rows.

    Multiple doors/readers commonly share the same enrolled employee roster,
    so a person present on more than one device just gets matched once.
    """
    device_users_by_badge: dict[str, dict] = {}
    for user in device_users:
        badge_number = str(user.get("employeeNo") or "").strip()
        if badge_number:
            device_users_by_badge.setdefault(badge_number, user)

    existing_badges = {e.badge_number for e in db.scalars(select(Employee)).all() if e.badge_number}
    created_names: list[str] = []
    for badge_number, user in device_users_by_badge.items():
        name = str(user.get("name") or "").strip()
        if not name or badge_number in existing_badges:
            continue
        db.add(Employee(full_name=name, badge_number=badge_number, department="Boshqa"))
        existing_badges.add(badge_number)
        created_names.append(name)
    db.commit()

    return HikvisionEmployeeSyncResult(
        device_users=len(device_users_by_badge),
        created=len(created_names),
        already_existing=len(device_users_by_badge) - len(created_names),
        created_names=created_names,
        warnings=[],
    )


def apply_events_to_attendance(db: Session, events: list[dict]) -> HikvisionEventSyncResult:
    """Match raw access-control events to employees by badge and upsert AttendanceRecord rows.

    Idempotent: re-submitting events that overlap a previous run just updates
    the same (employee, work_date) row again with the same min/max times.
    """
    employees = db.scalars(select(Employee)).all()
    by_badge = {e.badge_number: e for e in employees if e.badge_number}

    warnings: list[str] = []
    unmatched_badges: set[str] = set()
    times_by_key: dict[tuple[int, date_cls], list[time_cls]] = {}
    employee_by_key: dict[tuple[int, date_cls], Employee] = {}

    for event in events:
        badge_number = str(event.get("employeeNoString") or "").strip()
        employee = by_badge.get(badge_number)
        if not employee:
            unmatched_badges.add(badge_number)
            continue
        moment = parse_device_time(event["time"])
        key = (employee.id, moment.date())
        employee_by_key[key] = employee
        times_by_key.setdefault(key, []).append(moment.time())

    for badge_number in sorted(unmatched_badges):
        warnings.append(f"Tabel raqami {badge_number} bo'yicha xodim topilmadi. Avval xodimlarni sinxronlang.")

    matched_employee_ids: set[int] = set()
    for (employee_id, work_date), times in times_by_key.items():
        employee = employee_by_key[(employee_id, work_date)]
        matched_employee_ids.add(employee_id)
        record = db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.employee_id == employee_id,
                AttendanceRecord.work_date == work_date,
            )
        ).first()
        if not record:
            record = AttendanceRecord(employee_id=employee_id, work_date=work_date)
            db.add(record)
        apply_record_fields(record, employee, min(times), check_out_time=max(times) if len(times) > 1 else None)

    db.commit()
    return HikvisionEventSyncResult(
        events_fetched=len(events),
        days_updated=len(times_by_key),
        matched_employees=len(matched_employee_ids),
        warnings=warnings[:50],
    )
