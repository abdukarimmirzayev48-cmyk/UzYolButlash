import calendar
import csv
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import date as date_cls, datetime, time as time_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.config import TELEGRAM_BOT_USERNAME
from backend.app.db.session import get_db
from backend.app.models.attendance import LEAVE_STATUSES, AttendanceRecord, AttendanceStatus, Department, Employee, HikvisionSyncLog
from backend.app.models.task import TaskAssignee
from backend.app.schemas.attendance import (
    AttendanceAnalysisEntry,
    AttendanceDayCell,
    AttendanceDepartmentGroup,
    AttendanceEmployeeRow,
    AttendanceGrid,
    AttendanceImportResult,
    AttendanceMonthlyAnalysis,
    AttendanceMonthlySummary,
    AttendanceRecordRead,
    AttendanceRecordUpsert,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    HikvisionDeviceStatus,
    HikvisionEmployeeSyncResult,
    HikvisionEventSyncResult,
    HikvisionStatus,
    TelegramPairingResponse,
)
from backend.app.services.attendance_scoring import apply_record_fields, compute_late_minutes, lateness_band, score_employee_month
from backend.app.services.auth import require_edit
from backend.app.services.hikvision_client import (
    HikvisionClient,
    HikvisionError,
    configured_hosts,
    is_configured,
)
from backend.app.services.hikvision_sync import apply_events_to_attendance, merge_and_create_employees
from backend.app.services.telegram_bot import generate_pairing_code

employees_router = APIRouter(prefix="/api/attendance/employees", tags=["attendance"])
departments_router = APIRouter(prefix="/api/departments", tags=["departments"])
attendance_router = APIRouter(prefix="/api/attendance", tags=["attendance"])

WEEKDAY_LABELS = ["Душ", "Сеш", "Чор", "Пай", "Жум", "Шан", "Якш"]


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Xodim topilmadi.")
    return employee


def get_department_or_404(db: Session, department_id: int) -> Department:
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bo'lim topilmadi.")
    return department


def sync_employee_department_name(employee: Employee, db: Session) -> None:
    """Keep the legacy free-text `department` column in sync with the linked Department,
    so existing code that reads `employee.department` as a display string keeps working."""
    if employee.department_id is None:
        employee.department = None
        return
    department = db.get(Department, employee.department_id)
    if department:
        employee.department = department.name


def department_read_with_count(db: Session, department: Department) -> DepartmentRead:
    count = db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == department.id)) or 0
    data = DepartmentRead.model_validate(department).model_dump()
    data["employee_count"] = count
    return DepartmentRead(**data)


@departments_router.get("", response_model=list[DepartmentRead])
def list_departments(db: Session = Depends(get_db), is_active: bool | None = None):
    stmt = select(Department)
    if is_active is not None:
        stmt = stmt.where(Department.is_active == is_active)
    departments = db.scalars(stmt.order_by(Department.name)).all()
    return [department_read_with_count(db, d) for d in departments]


@departments_router.post("", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("xodimlar"))])
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Department).where(Department.name == payload.name)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bu nomdagi bo'lim allaqachon mavjud.")
    department = Department(**payload.model_dump())
    db.add(department)
    db.commit()
    db.refresh(department)
    return department_read_with_count(db, department)


@departments_router.patch("/{department_id}", response_model=DepartmentRead, dependencies=[Depends(require_edit("xodimlar"))])
def update_department(department_id: int, payload: DepartmentUpdate, db: Session = Depends(get_db)):
    department = get_department_or_404(db, department_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != department.name:
        if db.scalar(select(Department).where(Department.name == data["name"])):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bu nomdagi bo'lim allaqachon mavjud.")
        # Keep employees' denormalized display string in sync with the rename.
        for employee in db.scalars(select(Employee).where(Employee.department_id == department_id)).all():
            employee.department = data["name"]
    for key, value in data.items():
        setattr(department, key, value)
    db.commit()
    db.refresh(department)
    return department_read_with_count(db, department)


@departments_router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("xodimlar"))])
def delete_department(department_id: int, db: Session = Depends(get_db)):
    department = get_department_or_404(db, department_id)
    employee_count = db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == department_id)) or 0
    if employee_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bu bo'limga {employee_count} ta xodim biriktirilgan. Avval ularni boshqa bo'limga o'tkazing.",
        )
    db.delete(department)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@employees_router.get("", response_model=list[EmployeeRead])
def list_employees(db: Session = Depends(get_db), department: str | None = None, is_active: bool | None = None):
    stmt = select(Employee)
    if department:
        stmt = stmt.where(Employee.department == department)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)
    return db.scalars(stmt.order_by(Employee.department, Employee.full_name)).all()


def validate_employee_user_id(db: Session, user_id: int | None, exclude_employee_id: int | None = None) -> None:
    if user_id is None:
        return
    stmt = select(Employee.id).where(Employee.user_id == user_id)
    if exclude_employee_id is not None:
        stmt = stmt.where(Employee.id != exclude_employee_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bu foydalanuvchi allaqachon boshqa xodimga bog'langan.")


@employees_router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("xodimlar"))])
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    validate_employee_user_id(db, payload.user_id)
    employee = Employee(**payload.model_dump())
    sync_employee_department_name(employee, db)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@employees_router.patch("/{employee_id}", response_model=EmployeeRead, dependencies=[Depends(require_edit("xodimlar"))])
def update_employee(employee_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    if "user_id" in payload.model_dump(exclude_unset=True):
        validate_employee_user_id(db, payload.user_id, exclude_employee_id=employee_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    sync_employee_department_name(employee, db)
    db.commit()
    db.refresh(employee)
    return employee


@employees_router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("xodimlar"))])
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    task_count = db.scalar(select(func.count()).select_from(TaskAssignee).where(TaskAssignee.employee_id == employee_id)) or 0
    if task_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bu xodimga {task_count} ta topshiriq biriktirilgan. Avval topshiriqlarni boshqa xodimga o'tkazing yoki o'chiring.",
        )
    db.delete(employee)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@employees_router.post("/{employee_id}/telegram-pairing-code", response_model=TelegramPairingResponse, dependencies=[Depends(require_edit("xodimlar"))])
def create_telegram_pairing_code(employee_id: int, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    if not TELEGRAM_BOT_USERNAME:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Telegram bot sozlanmagan. Administrator .env faylida TELEGRAM_BOT_TOKEN/TELEGRAM_BOT_USERNAME qiymatlarini kiritishi kerak.")
    code, expires_at = generate_pairing_code(db, employee)
    return TelegramPairingResponse(code=code, deep_link=f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={code}", expires_at=expires_at)


@employees_router.post("/{employee_id}/telegram-unpair", response_model=EmployeeRead, dependencies=[Depends(require_edit("xodimlar"))])
def unpair_telegram(employee_id: int, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    employee.telegram_chat_id = None
    employee.telegram_pairing_code = None
    employee.telegram_pairing_code_expires_at = None
    db.commit()
    db.refresh(employee)
    return employee


@attendance_router.put("/records", response_model=AttendanceRecordRead, dependencies=[Depends(require_edit("davomat"))])
def upsert_record(payload: AttendanceRecordUpsert, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, payload.employee_id)
    record = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == payload.employee_id,
            AttendanceRecord.work_date == payload.work_date,
        )
    ).first()
    if not record:
        record = AttendanceRecord(employee_id=payload.employee_id, work_date=payload.work_date)
        db.add(record)
    apply_record_fields(
        record,
        employee,
        payload.check_in_time,
        payload.status,
        payload.early_leave,
        payload.disciplinary_violation,
        payload.absence_hours,
        payload.note,
        payload.check_out_time,
    )
    db.commit()
    db.refresh(record)
    return record


def _cell_band(record: AttendanceRecord) -> str:
    """CSS class the frontend paints the day cell with.

    Unexcused lateness keeps its graduated minor/moderate/major ramp; every
    excused/leave status gets its own band named after the status so it can be
    coloured (and legended) distinctly.
    """
    if record.status == AttendanceStatus.late:
        return lateness_band(record.late_minutes)
    if record.status == AttendanceStatus.absent:
        return "absent"
    if record.status in LEAVE_STATUSES or record.status == AttendanceStatus.late_excused:
        return record.status.value
    return "on_time"


@attendance_router.get("/grid", response_model=AttendanceGrid)
def get_attendance_grid(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    department: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Employee).where(Employee.is_active.is_(True))
    if department:
        stmt = stmt.where(Employee.department == department)
    employees = db.scalars(stmt.order_by(Employee.department, Employee.full_name)).all()

    days_in_month = calendar.monthrange(year, month)[1]
    days = list(range(1, days_in_month + 1))
    day_labels = [WEEKDAY_LABELS[date_cls(year, month, day).weekday()] for day in days]

    employee_ids = [e.id for e in employees]
    records: list[AttendanceRecord] = (
        db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.employee_id.in_(employee_ids),
                AttendanceRecord.work_date >= date_cls(year, month, 1),
                AttendanceRecord.work_date <= date_cls(year, month, days_in_month),
            )
        ).all()
        if employee_ids
        else []
    )
    records_by_employee: dict[int, list[AttendanceRecord]] = {}
    for record in records:
        records_by_employee.setdefault(record.employee_id, []).append(record)

    departments: dict[str, list[AttendanceEmployeeRow]] = {}
    analysis_late: list[AttendanceAnalysisEntry] = []
    analysis_score: list[AttendanceAnalysisEntry] = []
    total_late_events = 0
    total_absence_days = 0

    for employee in employees:
        employee_records = records_by_employee.get(employee.id, [])
        records_by_day = {r.work_date.day: r for r in employee_records}
        day_cells: dict[str, AttendanceDayCell] = {}
        for day in days:
            record = records_by_day.get(day)
            if record:
                day_cells[str(day)] = AttendanceDayCell(
                    check_in_time=record.check_in_time,
                    check_out_time=record.check_out_time,
                    status=record.status,
                    late_minutes=record.late_minutes,
                    early_leave=record.early_leave,
                    disciplinary_violation=record.disciplinary_violation,
                    absence_hours=record.absence_hours,
                    note=record.note,
                    band=_cell_band(record),
                )
            else:
                day_cells[str(day)] = AttendanceDayCell(status=AttendanceStatus.no_data, band="no_data")

        summary = score_employee_month(employee_records)
        row = AttendanceEmployeeRow(
            id=employee.id,
            full_name=employee.full_name,
            position=employee.position,
            scheduled_check_in=employee.scheduled_check_in,
            days=day_cells,
            summary=AttendanceMonthlySummary(**summary),
        )
        departments.setdefault(employee.department or "Boshqa", []).append(row)

        total_late_events += summary["late_days"]
        total_absence_days += summary["absence_days"]
        if summary["late_days"] > 0:
            analysis_late.append(
                AttendanceAnalysisEntry(employee_id=employee.id, full_name=employee.full_name, value=Decimal(summary["late_days"]))
            )
        analysis_score.append(
            AttendanceAnalysisEntry(employee_id=employee.id, full_name=employee.full_name, value=summary["score"])
        )

    analysis_late.sort(key=lambda item: item.value, reverse=True)
    analysis_score.sort(key=lambda item: item.value, reverse=True)

    return AttendanceGrid(
        year=year,
        month=month,
        days=days,
        day_labels=day_labels,
        departments=[
            AttendanceDepartmentGroup(name=name, employees=rows) for name, rows in departments.items()
        ],
        analysis=AttendanceMonthlyAnalysis(
            total_employees=len(employees),
            total_late_events=total_late_events,
            total_absence_days=total_absence_days,
            most_late_employees=analysis_late[:5],
            best_employees=analysis_score[:5],
            worst_employees=list(reversed(analysis_score[-5:])) if analysis_score else [],
        ),
    )


_BADGE_HEADERS = {"badge_number", "badge", "tabel", "tabel_raqami", "employee_id", "id", "hodim_id"}
_NAME_HEADERS = {"full_name", "fio", "ism", "hodim", "f.i.sh", "fish", "name", "xodim"}
_DATE_HEADERS = {"date", "sana", "work_date", "kun"}
_TIME_HEADERS = {"check_in_time", "time", "vaqt", "kelish_vaqti", "check_in", "keliш"}


def _find_header(fieldnames: list[str], candidates: set[str]) -> str | None:
    lookup = {(name or "").strip().lower(): name for name in fieldnames}
    for candidate in candidates:
        if candidate in lookup:
            return lookup[candidate]
    return None


def _parse_csv_date(value: str) -> date_cls | None:
    value = (value or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_csv_time(value: str) -> time_cls | None:
    value = (value or "").strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    return None


@attendance_router.post("/import", response_model=AttendanceImportResult, dependencies=[Depends(require_edit("davomat"))])
def import_attendance(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1251", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CSV fayl bo'sh yoki noto'g'ri formatda.")

    badge_col = _find_header(reader.fieldnames, _BADGE_HEADERS)
    name_col = _find_header(reader.fieldnames, _NAME_HEADERS)
    date_col = _find_header(reader.fieldnames, _DATE_HEADERS)
    time_col = _find_header(reader.fieldnames, _TIME_HEADERS)
    if not date_col or not time_col or not (badge_col or name_col):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV ustunlari aniqlanmadi. Kerak: sana, vaqt va (tabel raqami yoki F.I.Sh.).",
        )

    employees = db.scalars(select(Employee)).all()
    by_badge = {e.badge_number: e for e in employees if e.badge_number}
    by_name = {e.full_name.strip().lower(): e for e in employees}

    warnings: list[str] = []
    rows_processed = 0
    rows_matched = 0
    rows_skipped = 0
    times_by_key: dict[tuple[int, date_cls], list[time_cls]] = {}
    employee_by_key: dict[tuple[int, date_cls], Employee] = {}

    for row_number, row in enumerate(reader, start=2):
        rows_processed += 1
        employee: Employee | None = None
        if badge_col and row.get(badge_col):
            employee = by_badge.get(row[badge_col].strip())
        if not employee and name_col and row.get(name_col):
            employee = by_name.get(row[name_col].strip().lower())
        if not employee:
            rows_skipped += 1
            warnings.append(f"{row_number}-qator: xodim topilmadi.")
            continue

        work_date = _parse_csv_date(row.get(date_col, ""))
        check_in_time = _parse_csv_time(row.get(time_col, ""))
        if not work_date or not check_in_time:
            rows_skipped += 1
            warnings.append(f"{row_number}-qator: sana yoki vaqt formati noto'g'ri.")
            continue

        key = (employee.id, work_date)
        employee_by_key[key] = employee
        times_by_key.setdefault(key, []).append(check_in_time)
        rows_matched += 1

    for (employee_id, work_date), times in times_by_key.items():
        employee = employee_by_key[(employee_id, work_date)]
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
    return AttendanceImportResult(
        rows_processed=rows_processed,
        rows_matched=rows_matched,
        rows_skipped=rows_skipped,
        warnings=warnings[:50],
    )


def _ping_device(host: str) -> HikvisionDeviceStatus:
    try:
        # Short timeout on purpose: when the server can't reach the office LAN
        # at all (the normal production case — the LAN agent syncs instead),
        # a long timeout would just make the status modal hang.
        client = HikvisionClient(host=host, timeout=4)
        result = client.ping()
        return HikvisionDeviceStatus(host=host, reachable=True, device_user_count=result["totalUsers"])
    except HikvisionError as exc:
        return HikvisionDeviceStatus(host=host, reachable=False, error=str(exc))


@attendance_router.get("/hikvision/status", response_model=HikvisionStatus)
def hikvision_status(db: Session = Depends(get_db)):
    last_sync = db.scalars(select(HikvisionSyncLog).order_by(HikvisionSyncLog.synced_at.desc())).first()

    hosts = configured_hosts()
    if not is_configured():
        return HikvisionStatus(configured=False, devices=[], last_sync=last_sync)

    with ThreadPoolExecutor(max_workers=len(hosts)) as pool:
        devices = list(pool.map(_ping_device, hosts))
    return HikvisionStatus(configured=True, devices=devices, last_sync=last_sync)


@attendance_router.post("/hikvision/sync-employees", response_model=HikvisionEmployeeSyncResult, dependencies=[Depends(require_edit("davomat"))])
def hikvision_sync_employees(db: Session = Depends(get_db)):
    hosts = configured_hosts()
    if not hosts:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hikvision qurilmasi sozlanmagan (.env faylida HIKVISION_HOSTS ni kiriting).")

    device_users: list[dict] = []
    errors: list[str] = []
    for host in hosts:
        try:
            client = HikvisionClient(host=host)
            device_users.extend(client.list_users())
        except HikvisionError as exc:
            errors.append(str(exc))

    if errors and not device_users:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="; ".join(errors))

    result = merge_and_create_employees(db, device_users)
    result.warnings = errors + result.warnings
    return result


@attendance_router.post("/hikvision/sync-events", response_model=HikvisionEventSyncResult, dependencies=[Depends(require_edit("davomat"))])
def hikvision_sync_events(
    date_from: date_cls = Query(...),
    date_to: date_cls = Query(...),
    db: Session = Depends(get_db),
):
    if date_to < date_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.")

    hosts = configured_hosts()
    if not hosts:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Hikvision qurilmasi sozlanmagan (.env faylida HIKVISION_HOSTS ni kiriting).")

    # Merge events from every door/reader before computing earliest arrival —
    # the same employee can badge through whichever device is closer that day.
    events: list[dict] = []
    errors: list[str] = []
    for host in hosts:
        try:
            client = HikvisionClient(host=host)
            events.extend(client.search_events(f"{date_from}T00:00:00+05:00", f"{date_to}T23:59:59+05:00"))
        except HikvisionError as exc:
            errors.append(str(exc))

    if errors and not events:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="; ".join(errors))

    result = apply_events_to_attendance(db, events)
    result.warnings = (errors + result.warnings)[:50]
    return result
