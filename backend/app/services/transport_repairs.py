"""Ta'mir arizalari bo'yicha hisob: turib qolish, xarajat, ochiq ishlar.

Turib qolish soati arizaning ochiq turgan vaqtidan farq qiladi va shuni
alohida yozish kerak: ariza ochiq bo'lishi, lekin mashina yurishi mumkin --
masalan ehtiyot qism kutilayotgan bo'lsa. Ikkovini aralashtirib yuborish
mashinaning bo'sh turgan vaqtini bir necha barobar ko'p ko'rsatadi.

Xarajat ikki qismdan iborat: ehtiyot qismlar va ish haqi. Qismlar alohida
qatorlarda, chunki bitta ta'mirda bir nechtasi ketadi va ularni bitta
katakka yozib qo'yish xarajatni hisoblab bo'lmaydigan qilib qo'yadi.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from backend.app.models.transport import (
    CLOSED_REPAIR_STATUSES,
    OPEN_REPAIR_STATUSES,
    RepairSeverity,
    RepairStatus,
)

MSG_OPEN_REPAIRS = "Yopilmagan ta'mir arizalari bor"
MSG_CRITICAL_OPEN = "Kritik nosozlik yopilmagan"
MSG_IMMOBILISED = "Mashina yura olmaydi"
MSG_NO_RESULT = "Ta'mir tugagan, lekin natija yozilmagan"
MSG_DOWNTIME_OPEN = "Turib qolish tugagani qayd etilmagan"


def part_total(part) -> Decimal:
    """Qatorda jami yozilgan bo'lsa, o'sha; bo'lmasa miqdor x narx."""
    if part.total_amount is not None:
        return Decimal(part.total_amount)
    if part.unit_price is None:
        return Decimal("0")
    return (Decimal(part.quantity or 0) * Decimal(part.unit_price)).quantize(Decimal("0.01"))


def parts_total(repair) -> Decimal:
    return sum((part_total(part) for part in repair.parts), Decimal("0"))


def repair_total(repair) -> Decimal:
    return parts_total(repair) + Decimal(repair.labour_cost or 0)


def downtime_hours(repair, *, now: datetime | None = None) -> Decimal | None:
    """Turib qolish soati.

    Tugagani yozilmagan bo'lsa, hozirgacha hisoblanadi -- mashina hali ham
    turibdi degani, va bu raqam ko'rinib turishi kerak.
    """
    start = repair.downtime_started_at
    if start is None:
        return None
    end = repair.downtime_finished_at or now
    if end is None or end < start:
        return None
    return (Decimal((end - start).total_seconds()) / Decimal("3600")).quantize(Decimal("0.01"))


@dataclass
class RepairSummary:
    total: int = 0
    open_count: int = 0
    critical_open_count: int = 0
    immobilised_count: int = 0
    downtime_hours: Decimal = Decimal("0")
    parts_amount: Decimal = Decimal("0")
    labour_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    warnings: list[str] = field(default_factory=list)


def build_summary(repairs: list, *, now: datetime | None = None) -> RepairSummary:
    summary = RepairSummary()
    no_result = False
    downtime_open = False
    for repair in repairs:
        # Bekor qilingan ariza hisobga kirmaydi: u bo'lmagan ish.
        if repair.status == RepairStatus.cancelled:
            continue
        summary.total += 1
        summary.parts_amount += parts_total(repair)
        summary.labour_amount += Decimal(repair.labour_cost or 0)
        hours = downtime_hours(repair, now=now)
        if hours is not None:
            summary.downtime_hours += hours
        if repair.status in OPEN_REPAIR_STATUSES:
            summary.open_count += 1
            if repair.severity == RepairSeverity.critical:
                summary.critical_open_count += 1
            if not repair.can_move:
                summary.immobilised_count += 1
        if repair.status == RepairStatus.done and not (repair.result or "").strip():
            no_result = True
        if repair.downtime_started_at and not repair.downtime_finished_at and repair.status in CLOSED_REPAIR_STATUSES:
            downtime_open = True

    summary.total_amount = summary.parts_amount + summary.labour_amount
    if summary.open_count:
        summary.warnings.append(MSG_OPEN_REPAIRS)
    if summary.critical_open_count:
        summary.warnings.append(MSG_CRITICAL_OPEN)
    if summary.immobilised_count:
        summary.warnings.append(MSG_IMMOBILISED)
    if no_result:
        summary.warnings.append(MSG_NO_RESULT)
    if downtime_open:
        summary.warnings.append(MSG_DOWNTIME_OPEN)
    return summary


def next_repair_number(existing: set[str], on_date) -> str:
    day = f"RM-{on_date.strftime('%Y%m%d')}"
    for sequence in range(1, 1000):
        candidate = f"{day}-{sequence:02d}"
        if candidate not in existing:
            return candidate
    raise ValueError(f"{day} kuni uchun bo'sh ariza raqami qolmadi.")
