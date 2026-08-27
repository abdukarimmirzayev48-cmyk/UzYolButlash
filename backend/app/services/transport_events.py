"""Yoqilg'i va yo'l hodisalari: hisob va tekshiruv izi.

Ilgari mashinada oddiy yoqilg'i daftari bor edi -- quyildi, sarflandi,
qancha, qancha pulga. Bu savolga javob berardi: «bakka qancha yoqilg'i
ketdi». Lekin nazorat uchun kerak bo'lgan savolga javob bermasdi: «shu
yerda nima bo'lgan, kim nima dedi, tekshiruv nima bilan tugadi».

Hodisa yozuvi shu izni saqlaydi. Muhimi hodisaning o'zi emas -- keskin
tushish o'z-o'zidan o'g'irlik degani emas -- balki uning oxiri: haydovchi
tushuntirdimi, tekshirgan odam nima dedi, zarar undirildimi.

Shuning uchun ochiq va tekshirilmagan hodisalar alohida sanaladi. Yopilmagan
hodisa -- javobsiz savol, va u ro'yxatda ko'rinib turishi kerak.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from backend.app.models.transport import (
    FUEL_IN_TYPES,
    FUEL_OUT_TYPES,
    TransportEventCheckResult,
    TransportEventStatus,
    TransportEventType,
)

MSG_NOT_CHECKED = "Tekshirilmagan hodisalar bor"
MSG_VIOLATION_OPEN = "Nizom buzilishi tasdiqlangan, lekin yopilmagan"
MSG_LOSS_WITHOUT_DECISION = "Yo'qotish qayd etilgan, lekin qaror yozilmagan"
MSG_TRIP_SIPHONING = "Reysda normadan ortiq sarf aniqlandi"

OPEN_STATUSES = (TransportEventStatus.open, TransportEventStatus.in_review)


def amount_of(event) -> Decimal:
    """Bak ko'rsatkichlari kiritilgan bo'lsa, miqdor shulardan.

    Qo'lda yozilgan miqdor ham qoladi, lekin o'lchov ustun turadi -- ikkita
    manba bir narsani boshqa-boshqa aytmasin.
    """
    before = event.fuel_before_liters
    after = event.fuel_after_liters
    if before is not None and after is not None:
        return abs(Decimal(after) - Decimal(before))
    return Decimal(event.amount_liters or 0)


@dataclass
class EventSummary:
    total: int = 0
    open_count: int = 0
    not_checked_count: int = 0
    refuelled_liters: Decimal = Decimal("0")
    consumed_liters: Decimal = Decimal("0")
    balance_liters: Decimal = Decimal("0")
    total_cost_amount: Decimal = Decimal("0")
    possible_loss_liters: Decimal = Decimal("0")
    damage_amount: Decimal = Decimal("0")
    warnings: list[str] = field(default_factory=list)


def build_summary(events: list) -> EventSummary:
    summary = EventSummary()
    violation_open = False
    loss_without_decision = False
    for event in events:
        if event.status == TransportEventStatus.cancelled:
            continue
        summary.total += 1
        amount = amount_of(event)
        if event.event_type in FUEL_IN_TYPES:
            summary.refuelled_liters += amount
        elif event.event_type in FUEL_OUT_TYPES:
            summary.consumed_liters += amount
        summary.total_cost_amount += Decimal(event.cost_amount or 0)
        summary.possible_loss_liters += Decimal(event.possible_loss_liters or 0)
        summary.damage_amount += Decimal(event.damage_amount or 0)
        if event.status in OPEN_STATUSES:
            summary.open_count += 1
        if event.check_result == TransportEventCheckResult.not_checked:
            summary.not_checked_count += 1
        if event.check_result == TransportEventCheckResult.violation_confirmed and event.status in OPEN_STATUSES:
            violation_open = True
        if (event.possible_loss_liters or 0) > 0 and not (event.decision or "").strip():
            loss_without_decision = True

    summary.balance_liters = summary.refuelled_liters - summary.consumed_liters
    if summary.not_checked_count:
        summary.warnings.append(MSG_NOT_CHECKED)
    if violation_open:
        summary.warnings.append(MSG_VIOLATION_OPEN)
    if loss_without_decision:
        summary.warnings.append(MSG_LOSS_WITHOUT_DECISION)
    return summary


def next_event_number(existing: set[str], on_date) -> str:
    day = f"EV-{on_date.strftime('%Y%m%d')}"
    for sequence in range(1, 1000):
        candidate = f"{day}-{sequence:02d}"
        if candidate not in existing:
            return candidate
    raise ValueError(f"{day} kuni uchun bo'sh hodisa raqami qolmadi.")


def siphoning_event_fields(*, logistics, suspected_liters: Decimal) -> dict:
    """Reysdagi ortiqcha sarfdan hodisa ochish uchun maydonlar.

    Reys hisobi «slivga shubha» deb belgilagan miqdor bu yerga ko'chiriladi
    -- operator uni qo'lda qayta yozmaydi. Hodisa ochiq holatda qoladi:
    raqamni tizim topadi, javobni odam beradi.
    """
    return {
        "transport_id": logistics.transport_id,
        "logistics_id": logistics.id,
        "occurred_at": logistics.returned_at or logistics.arrived_at or logistics.departed_at,
        "event_type": TransportEventType.suspected_siphoning,
        "source": MSG_TRIP_SIPHONING,
        "odometer_km": logistics.odometer_end_km,
        "possible_loss_liters": suspected_liters,
        "check_result": TransportEventCheckResult.not_checked,
        "status": TransportEventStatus.open,
    }
