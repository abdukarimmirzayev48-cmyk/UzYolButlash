import calendar
import csv
import io
from datetime import date as date_cls, datetime, time as time_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.attendance import AttendanceRecord, AttendanceStatus, Employee
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
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
)
from backend.app.services.attendance_scoring import compute_late_minutes, lateness_band, score_employee_month

employees_router = APIRouter(prefix="/api/attendance/employees", tags=["attendance"])
attendance_router = APIRouter(prefix="/api/attendance", tags=["attendance"])

WEEKDAY_LABELS = ["Душ", "Сеш", "Чор", "Пай", "Жум", "Шан", "Якш"]


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Xodim topilmadi.")
    return employee


@employees_router.get("", response_model=list[EmployeeRead])
def list_employees(db: Session = Depends(get_db), department: str | None = None, is_active: bool | None = None):
    stmt = select(Employee)
    if department:
        stmt = stmt.where(Employee.department == department)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)
    return db.scalars(stmt.order_by(Employee.department, Employee.full_name)).all()


@employees_router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    employee = Employee(**payload.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@employees_router.patch("/{employee_id}", response_model=EmployeeRead)
def update_employee(employee_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee


@employees_router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = get_employee_or_404(db, employee_id)
    db.delete(employee)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _apply_record_fields(
    record: AttendanceRecord,
    employee: Employee,
    check_in_time: time_cls | None,
    status_override: AttendanceStatus | None = None,
    early_leave: bool = False,
    disciplinary_violation: bool = False,
    absence_hours: Decimal = Decimal("0"),
    note: str | None = None,
) -> None:
    record.check_in_time = check_in_time
    record.early_leave = early_leave
    record.disciplinary_violation = disciplinary_violation
    record.absence_hours = absence_hours
    record.note = note
    if status_override is not None:
        record.status = status_override
        record.late_minutes = (
            compute_late_minutes(employee.scheduled_check_in, check_in_time)
            if status_override == AttendanceStatus.late and check_in_time
            else 0
        )
    elif check_in_time is not None:
        late_minutes = compute_late_minutes(employee.scheduled_check_in, check_in_time)
        record.late_minutes = late_minutes
        record.status = AttendanceStatus.late if late_minutes > 0 else AttendanceStatus.on_time
    else:
        record.late_minutes = 0
        record.status = AttendanceStatus.absent


@attendance_router.put("/records", response_model=AttendanceRecordRead)
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
    _apply_record_fields(
        record,
        employee,
        payload.check_in_time,
        payload.status,
        payload.early_leave,
        payload.disciplinary_violation,
        payload.absence_hours,
        payload.note,
    )
    db.commit()
    db.refresh(record)
    return record


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
                    status=record.status,
                    late_minutes=record.late_minutes,
                    early_leave=record.early_leave,
                    disciplinary_violation=record.disciplinary_violation,
                    absence_hours=record.absence_hours,
                    note=record.note,
                    band=lateness_band(record.late_minutes) if record.status == AttendanceStatus.late else (
                        "absent" if record.status == AttendanceStatus.absent else "on_time"
                    ),
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


@attendance_router.post("/import", response_model=AttendanceImportResult)
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
    earliest_by_key: dict[tuple[int, date_cls], time_cls] = {}
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
        if key not in earliest_by_key or check_in_time < earliest_by_key[key]:
            earliest_by_key[key] = check_in_time
        rows_matched += 1

    for (employee_id, work_date), check_in_time in earliest_by_key.items():
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
        _apply_record_fields(record, employee, check_in_time)

    db.commit()
    return AttendanceImportResult(
        rows_processed=rows_processed,
        rows_matched=rows_matched,
        rows_skipped=rows_skipped,
        warnings=warnings[:50],
    )
