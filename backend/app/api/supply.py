"""Ta'minot bo'limining umumiy ko'rinishi.

Birja ticketlari va zaxira bitta jarayonning ikki tomoni: ticket -- pul
majburiyati, zaxira -- o'sha pulga olingan mol. Ilgari ularni faqat alohida
ro'yxatlarda ko'rish mumkin edi va «qaysi mahsulotdan qancha qoldi, qaysi
to'lov qachon» degan savolga javob yig'ish uchun ikkala sahifani ochib,
qo'lda qo'shish kerak edi.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.inventory import (
    ExchangeTicket,
    ExchangeTicketStatus,
    StockAllocation,
    StockAllocationStatus,
    StockLot,
)
from backend.app.models.supplier import Supplier

router = APIRouter(prefix="/api/supply", tags=["supply"])

MONEY = Decimal("0.01")
QTY = Decimal("0.001")

# Ochiq deganda -- puli hali to'lanmagan ticket. Yopilgan va bekor qilingani
# majburiyat ham, zaxira ham hisoblanmaydi.
OPEN_STATUSES = (
    ExchangeTicketStatus.opened,
    ExchangeTicketStatus.partially_paid,
    ExchangeTicketStatus.overdue,
)

STATUS_LABELS = {
    "draft": "Qoralama",
    "opened": "Ochilgan",
    "partially_paid": "Qisman to'langan",
    "overdue": "Muddati o'tgan",
    "paid": "To'langan",
    "closed": "Yopilgan",
    "cancelled": "Bekor qilingan",
}

# To'lov muddati bo'yicha guruhlar: qaysi pul qachon kerakligini bir qarashda
# ko'rsatadi.
DUE_BUCKETS = [
    ("overdue", "Muddati o'tgan", None, -1),
    ("week", "7 kun ichida", 0, 7),
    ("month", "8-30 kun", 8, 30),
    ("quarter", "31-90 kun", 31, 90),
    ("later", "90 kundan keyin", 91, None),
]

DUE_SOON_DAYS = 7


def money(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def qty(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(QTY, rounding=ROUND_HALF_UP)


def bucket_of(days: int) -> str:
    if days < 0:
        return "overdue"
    for key, _, low, high in DUE_BUCKETS[1:]:
        if (low is None or days >= low) and (high is None or days <= high):
            return key
    return "later"


@router.get("/overview")
def supply_overview(
    db: Session = Depends(get_db),
    product: str | None = None,
    supplier_id: int | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    status_filter: str | None = Query(None, alias="status"),
) -> dict[str, Any]:
    today = date.today()
    tickets = list(
        db.scalars(
            select(ExchangeTicket).options(
                selectinload(ExchangeTicket.supplier),
                selectinload(ExchangeTicket.stock_lot).selectinload(StockLot.allocations),
            )
        ).unique()
    )
    # Filtr variantlari filtrlashdan OLDIN yig'iladi: aks holda mahsulotni
    # tanlagan zahoti ro'yxatda o'sha bittasi qolib, boshqasiga o'tib
    # bo'lmaydi.
    all_products = sorted({t.product_name for t in tickets if t.product_name})
    all_suppliers = sorted(
        {(t.supplier_id, t.supplier_name) for t in tickets if t.supplier_id},
        key=lambda pair: pair[1] or "",
    )

    if product:
        tickets = [t for t in tickets if t.product_name == product]
    if supplier_id:
        tickets = [t for t in tickets if t.supplier_id == supplier_id]
    if due_from:
        tickets = [t for t in tickets if t.due_date and t.due_date >= due_from]
    if due_to:
        tickets = [t for t in tickets if t.due_date and t.due_date <= due_to]
    if status_filter:
        tickets = [t for t in tickets if t.status.value == status_filter]

    open_tickets = [t for t in tickets if t.status in OPEN_STATUSES]

    obligation = sum((t.total_amount for t in open_tickets), Decimal("0"))
    overdue = [t for t in open_tickets if t.due_date and t.due_date < today]
    due_soon = [t for t in open_tickets if t.due_date and 0 <= (t.due_date - today).days <= DUE_SOON_DAYS]

    stock_initial = stock_available = stock_reserved = Decimal("0")
    stock_value = Decimal("0")
    for ticket in tickets:
        lot = ticket.stock_lot
        if not lot:
            continue
        stock_initial += Decimal(lot.quantity_initial or 0)
        stock_available += Decimal(lot.quantity_available or 0)
        stock_reserved += Decimal(lot.quantity_reserved or 0)
        stock_value += Decimal(lot.quantity_available or 0) * Decimal(lot.unit_cost or 0)

    buckets = {key: {"key": key, "label": label, "count": 0, "amount": Decimal("0")} for key, label, *_ in DUE_BUCKETS}
    for ticket in open_tickets:
        if not ticket.due_date:
            continue
        row = buckets[bucket_of((ticket.due_date - today).days)]
        row["count"] += 1
        row["amount"] += Decimal(ticket.total_amount or 0)

    products: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"tickets": 0, "quantity": Decimal("0"), "available": Decimal("0"), "reserved": Decimal("0"), "shipped": Decimal("0"), "value": Decimal("0"), "obligation": Decimal("0")}
    )
    suppliers: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"tickets": 0, "obligation": Decimal("0"), "available": Decimal("0"), "value": Decimal("0")}
    )
    for ticket in tickets:
        lot = ticket.stock_lot
        available = Decimal(lot.quantity_available or 0) if lot else Decimal("0")
        reserved = Decimal(lot.quantity_reserved or 0) if lot else Decimal("0")
        initial = Decimal(lot.quantity_initial or 0) if lot else Decimal("0")
        value = available * (Decimal(lot.unit_cost or 0) if lot else Decimal("0"))
        obligation_line = Decimal(ticket.total_amount or 0) if ticket.status in OPEN_STATUSES else Decimal("0")

        row = products[ticket.product_name or "—"]
        row["tickets"] += 1
        row["quantity"] += Decimal(ticket.quantity or 0)
        row["available"] += available
        row["reserved"] += reserved
        # Mijozga ketgani: olib kelinganidan erkin va band qolganini ayirsak.
        row["shipped"] += max(Decimal("0"), initial - available - reserved)
        row["value"] += value
        row["obligation"] += obligation_line
        row["unit"] = ticket.unit

        if ticket.supplier_id:
            srow = suppliers[ticket.supplier_id]
            srow["tickets"] += 1
            srow["obligation"] += obligation_line
            srow["available"] += available
            srow["value"] += value
            srow["name"] = ticket.supplier_name

    status_counts: dict[str, int] = defaultdict(int)
    for ticket in tickets:
        status_counts[ticket.status.value] += 1

    upcoming = sorted(
        [t for t in open_tickets if t.due_date],
        key=lambda t: t.due_date,
    )[:8]

    return {
        "filter_options": {
            "products": all_products,
            "suppliers": [{"id": sid, "name": name} for sid, name in all_suppliers],
            "statuses": [{"key": key, "label": label} for key, label in STATUS_LABELS.items()],
        },
        "now": {
            "tickets_total": len(tickets),
            "tickets_open": len(open_tickets),
            "obligation": money(obligation),
            "overdue_amount": money(sum((t.total_amount for t in overdue), Decimal("0"))),
            "overdue_count": len(overdue),
            "due_soon_amount": money(sum((t.total_amount for t in due_soon), Decimal("0"))),
            "due_soon_count": len(due_soon),
            "stock_initial": qty(stock_initial),
            "stock_available": qty(stock_available),
            "stock_reserved": qty(stock_reserved),
            "stock_shipped": qty(max(Decimal("0"), stock_initial - stock_available - stock_reserved)),
            "stock_value": money(stock_value),
        },
        "due_buckets": [
            {**row, "amount": money(row["amount"])}
            for row in (buckets[key] for key, *_ in DUE_BUCKETS)
        ],
        "by_product": sorted(
            [
                {
                    "product": name,
                    "unit": row.get("unit"),
                    "tickets": row["tickets"],
                    "quantity": qty(row["quantity"]),
                    "available": qty(row["available"]),
                    "reserved": qty(row["reserved"]),
                    "shipped": qty(row["shipped"]),
                    "value": money(row["value"]),
                    "obligation": money(row["obligation"]),
                }
                for name, row in products.items()
            ],
            key=lambda row: row["available"],
            reverse=True,
        ),
        "by_supplier": sorted(
            [
                {
                    "supplier_id": sid,
                    "name": row.get("name"),
                    "tickets": row["tickets"],
                    "obligation": money(row["obligation"]),
                    "available": qty(row["available"]),
                    "value": money(row["value"]),
                }
                for sid, row in suppliers.items()
            ],
            key=lambda row: row["obligation"],
            reverse=True,
        ),
        "status_mix": {
            "total": len(tickets),
            "items": [
                {"key": key, "label": label, "count": status_counts.get(key, 0)}
                for key, label in STATUS_LABELS.items()
                if status_counts.get(key, 0)
            ],
        },
        "upcoming": [
            {
                "ticket_id": t.id,
                "ticket_number": t.ticket_number,
                "supplier_name": t.supplier_name,
                "product_name": t.product_name,
                "due_date": t.due_date,
                "days": (t.due_date - today).days,
                "amount": money(t.total_amount),
                "status": t.status.value,
            }
            for t in upcoming
        ],
    }
