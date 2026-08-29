"""Talabnomalar bo'yicha boshqaruv paneli.

Ro'yxat bitta savolga javob beradi: «shu talabnomada nima bo'lgan». Panel
boshqasiga: «umuman qanday ketyapti» -- nechtasi kelib, nechtasi
shartnomaga aylandi, nechtasi rad etildi, qaysi mahsulot va qaysi hudud
ko'p so'ralmoqda, va eng muhimi -- qaysilari javobsiz turib qolgan.

Hisob shu yerda, API qatlamida emas: ro'yxat va panel bir xil filtrlangan
ma'lumot ustidan ishlaydi, ya'ni ekrandagi ikkita raqam bir-biriga zid
bo'lib qololmaydi.

Ochiq talabnoma -- javobsiz savol. Shuning uchun uning yoshi alohida
sanaladi: bir hafta javobsiz turgan talabnoma mijoz uchun rad javobidan
farq qilmaydi.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

# Ochiq talabnoma shuncha kundan ortiq turgan bo'lsa, e'tibor talab qiladi.
STALE_DAYS = 7

# Dinamika uchun oylar soni.
TREND_MONTHS = 6

# Ro'yxatlarda nechta qator ko'rsatiladi.
TOP_ROWS = 6

MSG_STALE_REQUESTS = "Javobsiz turgan talabnomalar bor"
MSG_NO_DATA = "Tanlangan davrda talabnoma yo'q"

# Yakuniy holatlar: ular ustida ish tugagan.
CONVERTED_STATUSES = ("contract_signed", "converted_to_order")
CLOSED_STATUSES = CONVERTED_STATUSES + ("rejected",)


@dataclass
class NamedCount:
    key: str
    label: str
    count: int = 0
    quantity: Decimal = Decimal("0")


@dataclass
class MonthPoint:
    month: str
    created: int = 0
    converted: int = 0
    rejected: int = 0


@dataclass
class StaleRequest:
    id: int
    request_number: str
    company_name: str
    status: str
    status_label: str
    days_open: int
    quantity: Decimal


@dataclass
class RequestDashboard:
    total: int = 0
    open_count: int = 0
    converted_count: int = 0
    rejected_count: int = 0
    stale_count: int = 0
    total_quantity: Decimal = Decimal("0")
    converted_quantity: Decimal = Decimal("0")
    conversion_percent: Decimal | None = None
    average_days_to_convert: Decimal | None = None
    by_status: list[NamedCount] = field(default_factory=list)
    by_product: list[NamedCount] = field(default_factory=list)
    by_region: list[NamedCount] = field(default_factory=list)
    by_month: list[MonthPoint] = field(default_factory=list)
    top_clients: list[NamedCount] = field(default_factory=list)
    stale: list[StaleRequest] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def month_key(value: datetime | date | None) -> str | None:
    return None if value is None else f"{value.year:04d}-{value.month:02d}"


def recent_months(today: date, count: int = TREND_MONTHS) -> list[str]:
    months: list[str] = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(months))


def top_of(counter: dict[str, NamedCount], limit: int = TOP_ROWS) -> list[NamedCount]:
    rows = sorted(counter.values(), key=lambda row: (row.count, row.quantity), reverse=True)
    return rows[:limit]


def converted_at(request) -> datetime | None:
    """Talabnoma qachon shartnomaga aylangani -- holat tarixidan.

    Yozuvning o'z sanasi yo'q: `updated_at` keyingi har qanday tahrirda
    siljiydi va «necha kunda aylandi» degan raqamni buzadi.
    """
    entries = [
        entry
        for entry in (request.status_history or [])
        if getattr(entry.new_status, "value", entry.new_status) in CONVERTED_STATUSES
    ]
    if not entries:
        return None
    return min(entry.created_at for entry in entries)


def build_dashboard(
    requests: list,
    *,
    now: datetime | None = None,
    status_labels: dict | None = None,
) -> RequestDashboard:
    now = now or datetime.now()
    today = now.date()
    labels = status_labels or {}
    board = RequestDashboard()

    by_status: dict[str, NamedCount] = {}
    by_product: dict[str, NamedCount] = {}
    by_region: dict[str, NamedCount] = {}
    by_client: dict[str, NamedCount] = {}
    months: dict[str, MonthPoint] = {key: MonthPoint(month=key) for key in recent_months(today)}
    convert_days: list[int] = []

    for request in requests:
        status = getattr(request.status, "value", request.status)
        quantity = Decimal(request.total_quantity or 0)
        board.total += 1
        board.total_quantity += quantity

        row = by_status.setdefault(status, NamedCount(key=status, label=labels.get(status, status)))
        row.count += 1
        row.quantity += quantity

        product_name = request.product.name if request.product else "—"
        product_row = by_product.setdefault(product_name, NamedCount(key=product_name, label=product_name))
        product_row.count += 1
        product_row.quantity += quantity

        region = (request.region or "").strip() or "—"
        region_row = by_region.setdefault(region, NamedCount(key=region, label=region))
        region_row.count += 1
        region_row.quantity += quantity

        client = (request.company_name or "").strip() or "—"
        client_row = by_client.setdefault(client, NamedCount(key=client, label=client))
        client_row.count += 1
        client_row.quantity += quantity

        created_month = month_key(request.created_at)
        if created_month in months:
            months[created_month].created += 1

        if status in CONVERTED_STATUSES:
            board.converted_count += 1
            board.converted_quantity += quantity
            when = converted_at(request)
            if when:
                key = month_key(when)
                if key in months:
                    months[key].converted += 1
                delta = (when - request.created_at).days
                if delta >= 0:
                    convert_days.append(delta)
        elif status == "rejected":
            board.rejected_count += 1
            key = month_key(request.updated_at)
            if key in months:
                months[key].rejected += 1
        else:
            board.open_count += 1
            days_open = (now - request.created_at).days
            if days_open >= STALE_DAYS:
                board.stale_count += 1
                board.stale.append(
                    StaleRequest(
                        id=request.id,
                        request_number=request.request_number,
                        company_name=client,
                        status=status,
                        status_label=labels.get(status, status),
                        days_open=days_open,
                        quantity=quantity,
                    )
                )

    board.by_status = sorted(by_status.values(), key=lambda row: row.count, reverse=True)
    board.by_product = top_of(by_product)
    board.by_region = top_of(by_region)
    board.top_clients = top_of(by_client)
    board.by_month = [months[key] for key in recent_months(today)]
    # Eng uzoq turgani yuqorida: panel aynan shu ro'yxat uchun ochiladi.
    board.stale.sort(key=lambda row: row.days_open, reverse=True)
    board.stale = board.stale[:TOP_ROWS]

    if board.total:
        board.conversion_percent = (
            Decimal(board.converted_count) / Decimal(board.total) * Decimal("100")
        ).quantize(Decimal("0.1"))
    if convert_days:
        board.average_days_to_convert = (
            Decimal(sum(convert_days)) / Decimal(len(convert_days))
        ).quantize(Decimal("0.1"))

    if board.stale_count:
        board.warnings.append(MSG_STALE_REQUESTS)
    if not board.total:
        board.warnings.append(MSG_NO_DATA)
    return board
