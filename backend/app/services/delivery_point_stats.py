"""ABZ nuqtalari bo'yicha boshqaruv paneli.

To'rtta ko'rsatkich va ularning o'tgan oyga nisbatan o'zgarishi. O'zgarish
haqiqiy hisob bo'lishi kerak, bezak emas: shuning uchun o'tgan oy oxirida
har bir nuqta qaysi holatda bo'lgani tarixdan tiklanadi.

Tiklash teskari yuriladi: hozirgi holatdan boshlab, chegara sanadan keyingi
har bir o'zgarish bekor qilinadi. Chegara sanadan keyin ochilgan nuqta esa
o'sha paytda umuman mavjud bo'lmagan.

Quvvat o'zgarishi boshqacha hisoblanadi. Quvvat tarixi yuritilmaydi --
uni ham yozib borish mumkin edi, lekin u kamdan-kam o'zgaradi va butun
jadval faqat bitta raqam uchun paydo bo'lardi. Shuning uchun «o'tgan oyga
nisbatan» deganda shu oyda qo'shilgan nuqtalarning quvvati tushuniladi,
va bu nomida ham aytiladi.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from backend.app.models.delivery_point import DeliveryPointStatus as S

MSG_NO_POINTS = "Hali birorta ABZ nuqtasi kiritilmagan"
MSG_ATTENTION = "E'tibor talab qiladigan ABZ bor"
MSG_NO_COORDINATES = "Koordinatasi kiritilmagan ABZ bor"
MSG_NO_RESPONSIBLE = "Mas'ul shaxsi ko'rsatilmagan ABZ bor"

STATUS_ORDER = (S.active, S.attention, S.inactive, S.planned)


def month_start(today: date) -> date:
    return today.replace(day=1)


def status_at(point, cutoff: datetime) -> S | None:
    """Nuqtaning `cutoff` paytidagi holati; o'shanda bo'lmagan bo'lsa None."""
    if point.created_at > cutoff:
        return None
    status = point.status
    # Tarix yangisidan eskisiga tartiblangan; chegaradan keyingi har bir
    # o'zgarishni bekor qilamiz.
    for entry in point.status_history or []:
        if entry.created_at > cutoff and entry.old_status is not None:
            status = entry.old_status
    return status


@dataclass
class StatusShare:
    key: str
    label: str
    count: int = 0
    percent: Decimal = Decimal("0")


@dataclass
class PointDashboard:
    total: int = 0
    total_delta: int = 0
    active: int = 0
    active_delta: int = 0
    attention: int = 0
    attention_delta: int = 0
    daily_capacity: Decimal = Decimal("0")
    capacity_added: Decimal = Decimal("0")
    by_status: list[StatusShare] = field(default_factory=list)
    with_coordinates: int = 0
    warnings: list[str] = field(default_factory=list)


def build_dashboard(points: list, *, today: date | None = None, status_labels: dict | None = None) -> PointDashboard:
    today = today or date.today()
    labels = status_labels or {}
    # Chegara -- shu oyning birinchi kuni: undan oldingisi «o'tgan oy».
    cutoff = datetime.combine(month_start(today), datetime.min.time())
    board = PointDashboard()

    counts: dict[S, int] = {status: 0 for status in STATUS_ORDER}
    before = {"total": 0, "active": 0, "attention": 0}
    missing_coordinates = False
    missing_responsible = False

    for point in points:
        board.total += 1
        counts[point.status] = counts.get(point.status, 0) + 1
        board.daily_capacity += Decimal(point.daily_capacity_tons or 0)
        if point.latitude and point.longitude:
            board.with_coordinates += 1
        else:
            missing_coordinates = True
        if not (point.responsible_name or "").strip():
            missing_responsible = True
        if point.created_at >= cutoff:
            board.capacity_added += Decimal(point.daily_capacity_tons or 0)

        was = status_at(point, cutoff)
        if was is not None:
            before["total"] += 1
            if was == S.active:
                before["active"] += 1
            elif was == S.attention:
                before["attention"] += 1

    board.active = counts.get(S.active, 0)
    board.attention = counts.get(S.attention, 0)
    board.total_delta = board.total - before["total"]
    board.active_delta = board.active - before["active"]
    board.attention_delta = board.attention - before["attention"]

    for status in STATUS_ORDER:
        count = counts.get(status, 0)
        percent = (
            (Decimal(count) / Decimal(board.total) * Decimal("100")).quantize(Decimal("0.1"))
            if board.total
            else Decimal("0")
        )
        board.by_status.append(
            StatusShare(key=status.value, label=labels.get(status.value, status.value), count=count, percent=percent)
        )

    if not board.total:
        board.warnings.append(MSG_NO_POINTS)
    if board.attention:
        board.warnings.append(MSG_ATTENTION)
    if missing_coordinates:
        board.warnings.append(MSG_NO_COORDINATES)
    if missing_responsible:
        board.warnings.append(MSG_NO_RESPONSIBLE)
    return board
