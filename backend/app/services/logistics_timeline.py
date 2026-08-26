"""Reys vaqt bo'yicha qanday o'tgani: davomiylik, kechikish, turib qolish.

Ilgari reysda faqat to'rtta SANA bor edi -- reja va fakt, chiqish va yetib
borish. Sana bilan «reys necha soat davom etdi» degan savolga javob berib
bo'lmaydi, «necha soat kechikdi» ham, «yuklash qancha vaqt oldi» ham.
Bitumovozda bu ayniqsa muhim: bitum sovuydi, va yo'lda yoki tushirishda
ortiqcha turgan har soat mahsulot sifatiga tegadi.

Yettita nuqta yoziladi: yo'lga chiqdi, yuklash boshlandi va tugadi,
ob'ektga yetdi, tushirish boshlandi va tugadi, bazaga qaytdi. Qolgani
shulardan hisoblanadi. Hisob faqat ikkala uchi ham ma'lum bo'lganda
chiqadi -- yarim ma'lumotdan chiqarilgan raqam yo'qligidan yomonroq.

Nuqtalar tartibi ham tekshiriladi: tushirish yuklashdan oldin tugagan
bo'lsa, bu kiritishdagi xato va uni jimgina hisoblab yuborish mumkin emas.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

MSG_ORDER_BROKEN = "Reys vaqtlari ketma-ketligi buzilgan"
MSG_LATE_DEPARTURE = "Rejadan kech chiqdi"
MSG_LATE_ARRIVAL = "Ob'ektga kech yetdi"
MSG_LONG_LOADING = "Yuklash uzoq davom etdi"
MSG_LONG_UNLOADING = "Tushirish uzoq davom etdi"
MSG_NOT_RETURNED = "Bazaga qaytish qayd etilmagan"

# Shu soatdan oshsa e'tibor talab qiladi. Bitumovozni yuklash odatda bir
# soat, tushirish bir-ikki soat oladi.
LONG_LOADING_HOURS = Decimal("3")
LONG_UNLOADING_HOURS = Decimal("4")

# Nuqtalar ketma-ketligi. Ro'yxat tartibi -- tekshiruvning o'zi.
POINTS = (
    ("departed_at", "Yo'lga chiqdi"),
    ("loading_started_at", "Yuklash boshlandi"),
    ("loading_finished_at", "Yuklash tugadi"),
    ("arrived_at", "Ob'ektga yetdi"),
    ("unloading_started_at", "Tushirish boshlandi"),
    ("unloading_finished_at", "Tushirish tugadi"),
    ("returned_at", "Bazaga qaytdi"),
)


@dataclass
class TimelinePoint:
    key: str
    label: str
    at: datetime | None


@dataclass
class Timeline:
    points: list[TimelinePoint] = field(default_factory=list)
    total_hours: Decimal | None = None
    loading_hours: Decimal | None = None
    unloading_hours: Decimal | None = None
    driving_hours: Decimal | None = None
    departure_delay_hours: Decimal | None = None
    arrival_delay_hours: Decimal | None = None
    filled_points: int = 0
    warnings: list[str] = field(default_factory=list)


def hours_between(start: datetime | None, end: datetime | None) -> Decimal | None:
    if start is None or end is None or end < start:
        return None
    return (Decimal((end - start).total_seconds()) / Decimal("3600")).quantize(Decimal("0.01"))


def build_timeline(logistics, *, planned_departure: datetime | None = None, planned_arrival: datetime | None = None) -> Timeline:
    timeline = Timeline()
    values: dict[str, datetime | None] = {}
    for key, label in POINTS:
        at = getattr(logistics, key, None)
        values[key] = at
        timeline.points.append(TimelinePoint(key=key, label=label, at=at))
        if at is not None:
            timeline.filled_points += 1

    # Ketma-ketlik: kiritilgan nuqtalar o'sib borishi kerak.
    known = [(key, at) for key, at in values.items() if at is not None]
    order = [key for key, _ in POINTS]
    known.sort(key=lambda pair: order.index(pair[0]))
    for (_, earlier), (_, later) in zip(known, known[1:]):
        if later < earlier:
            timeline.warnings.append(MSG_ORDER_BROKEN)
            break

    timeline.loading_hours = hours_between(values["loading_started_at"], values["loading_finished_at"])
    timeline.unloading_hours = hours_between(values["unloading_started_at"], values["unloading_finished_at"])
    # Reys uzunligi: chiqishdan qaytishgacha; qaytish yozilmagan bo'lsa,
    # tushirish tugagunicha -- bu ham foydali, faqat qisqaroq.
    end = values["returned_at"] or values["unloading_finished_at"]
    timeline.total_hours = hours_between(values["departed_at"], end)
    if timeline.total_hours is not None:
        stationary = sum(
            (value for value in (timeline.loading_hours, timeline.unloading_hours) if value is not None),
            Decimal("0"),
        )
        driving = timeline.total_hours - stationary
        timeline.driving_hours = driving if driving >= 0 else None

    timeline.departure_delay_hours = hours_between(planned_departure, values["departed_at"])
    timeline.arrival_delay_hours = hours_between(planned_arrival, values["arrived_at"])
    if timeline.departure_delay_hours:
        timeline.warnings.append(MSG_LATE_DEPARTURE)
    if timeline.arrival_delay_hours:
        timeline.warnings.append(MSG_LATE_ARRIVAL)
    if timeline.loading_hours is not None and timeline.loading_hours > LONG_LOADING_HOURS:
        timeline.warnings.append(MSG_LONG_LOADING)
    if timeline.unloading_hours is not None and timeline.unloading_hours > LONG_UNLOADING_HOURS:
        timeline.warnings.append(MSG_LONG_UNLOADING)
    if values["unloading_finished_at"] and not values["returned_at"]:
        timeline.warnings.append(MSG_NOT_RETURNED)
    return timeline
