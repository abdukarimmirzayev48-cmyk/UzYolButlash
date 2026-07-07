from datetime import time
from decimal import Decimal

from backend.app.models.attendance import AttendanceRecord, AttendanceStatus

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
    late_days = sum(1 for r in records if r.late_minutes > 0)
    total_late_minutes = sum(r.late_minutes for r in records)
    absence_days = sum(1 for r in records if r.status == AttendanceStatus.absent)
    absence_hours = sum(
        (Decimal(r.absence_hours or 0) for r in records if r.status != AttendanceStatus.absent), Decimal("0")
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
        "absence_hours": absence_hours,
        "early_leave_count": early_leave_count,
        "disciplinary_count": disciplinary_count,
        "score": score.quantize(Decimal("0.1")),
        "grade": grade_for_score(score),
    }
