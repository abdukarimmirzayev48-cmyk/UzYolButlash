from datetime import time
from decimal import Decimal

from backend.app.models.attendance import LEAVE_STATUSES, AttendanceRecord, AttendanceStatus, Employee

LATE_STATUSES = (AttendanceStatus.late, AttendanceStatus.late_excused)

MINOR_LATE_MINUTES = 15
MODERATE_LATE_MINUTES = 30

LATE_EVENT_PENALTY = Decimal("2")
LATE_MINUTE_PENALTY = Decimal("0.5")
ABSENCE_HOUR_PENALTY = Decimal("10")
ABSENCE_DAY_PENALTY = Decimal("20")
EARLY_LEAVE_PENALTY = Decimal("5")
DISCIPLINARY_PENALTY = Decimal("10")


def compute_late_minutes(scheduled: time, actual: time) -> int:
    scheduled_minutes = scheduled.hour * 60 + scheduled.minute
    actual_minutes = actual.hour * 60 + actual.minute
    return max(0, actual_minutes - scheduled_minutes)


def apply_record_fields(
    record: AttendanceRecord,
    employee: Employee,
    check_in_time: time | None,
    status_override: AttendanceStatus | None = None,
    early_leave: bool = False,
    disciplinary_violation: bool = False,
    absence_hours: Decimal = Decimal("0"),
    note: str | None = None,
    check_out_time: time | None = None,
) -> None:
    record.check_in_time = check_in_time
    record.check_out_time = check_out_time
    record.early_leave = early_leave
    record.disciplinary_violation = disciplinary_violation
    record.absence_hours = absence_hours
    record.note = note
    if status_override is not None:
        record.status = status_override
        # Excused lateness still records how late the person was (useful on the
        # timesheet); score_employee_month() is what decides not to charge for it.
        record.late_minutes = (
            compute_late_minutes(employee.scheduled_check_in, check_in_time)
            if status_override in LATE_STATUSES and check_in_time
            else 0
        )
    elif check_in_time is not None:
        late_minutes = compute_late_minutes(employee.scheduled_check_in, check_in_time)
        record.late_minutes = late_minutes
        record.status = AttendanceStatus.late if late_minutes > 0 else AttendanceStatus.on_time
    else:
        record.late_minutes = 0
        record.status = AttendanceStatus.absent


def lateness_band(late_minutes: int) -> str:
    if late_minutes <= 0:
        return "on_time"
    if late_minutes <= MINOR_LATE_MINUTES:
        return "minor"
    if late_minutes <= MODERATE_LATE_MINUTES:
        return "moderate"
    return "major"


def grade_for_score(score: Decimal) -> str:
    if score >= 95:
        return "A"
    if score >= 85:
        return "B"
    if score >= 70:
        return "C"
    if score >= 50:
        return "D"
    return "E"


def score_employee_month(records: list[AttendanceRecord]) -> dict:
    # Only unexcused lateness (сабабсиз) is charged for. Excused lateness keeps
    # its recorded minutes for the timesheet but is deliberately excluded here.
    late_days = sum(1 for r in records if r.status == AttendanceStatus.late and r.late_minutes > 0)
    total_late_minutes = sum(r.late_minutes for r in records if r.status == AttendanceStatus.late)
    absence_days = sum(1 for r in records if r.status == AttendanceStatus.absent)
    leave_days = sum(1 for r in records if r.status in LEAVE_STATUSES)
    absence_hours = sum(
        (
            Decimal(r.absence_hours or 0)
            for r in records
            if r.status != AttendanceStatus.absent and r.status not in LEAVE_STATUSES
        ),
        Decimal("0"),
    )
    early_leave_count = sum(1 for r in records if r.early_leave)
    disciplinary_count = sum(1 for r in records if r.disciplinary_violation)

    penalty = (
        Decimal(late_days) * LATE_EVENT_PENALTY
        + Decimal(total_late_minutes) * LATE_MINUTE_PENALTY
        + absence_hours * ABSENCE_HOUR_PENALTY
        + Decimal(absence_days) * ABSENCE_DAY_PENALTY
        + Decimal(early_leave_count) * EARLY_LEAVE_PENALTY
        + Decimal(disciplinary_count) * DISCIPLINARY_PENALTY
    )
    score = max(Decimal("0"), min(Decimal("100"), Decimal("100") - penalty))
    return {
        "late_days": late_days,
        "total_late_minutes": total_late_minutes,
        "absence_days": absence_days,
        "leave_days": leave_days,
        "absence_hours": absence_hours,
        "early_leave_count": early_leave_count,
        "disciplinary_count": disciplinary_count,
        "score": score.quantize(Decimal("0.1")),
        "grade": grade_for_score(score),
    }
