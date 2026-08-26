"""Aggregates for the "Yetkazib berish" module overview.

Same approach as task_stats: load the rows once with their relationships and
count in Python. The delivery tables are small (batches, one logistics record
each, a handful of trucks) and this keeps the numbers on the overview provably
the same objects the batch and logistics lists show.

Two kinds of filter, deliberately treated differently:

* **client / route** narrow *which* of the business you are looking at, so they
  apply to everything on the page.
* **date range** narrows *when*, so it applies only to results that already
  happened. Operational figures -- what is on the road, what is late, what
  still needs a lorry -- always mean "right now" and live in their own section
  on the page. Letting a date range shrink them would hide real, open problems
  behind a filter, which is exactly the kind of number a dispatcher must never
  miss.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from backend.app.models.delivery import BatchStatus, DeliveryBatch, LogisticsStatus
from backend.app.models.transport import UNAVAILABLE_STATUSES, Transport, TransportStatus

LIST_LIMIT = 8

# A batch stops being "work in progress" once it is finished or dropped.
BATCH_CLOSED = {BatchStatus.completed, BatchStatus.cancelled}
# Statuses that mean a truck is physically moving or being handled right now.
BATCH_ON_THE_MOVE = {
    BatchStatus.loading,
    BatchStatus.loaded,
    BatchStatus.in_transit,
    BatchStatus.arrived,
    BatchStatus.unloading,
}
# Things a dispatcher has to act on.
BATCH_PROBLEM = {BatchStatus.issue, BatchStatus.quantity_difference}

LOGISTICS_CLOSED = {LogisticsStatus.completed, LogisticsStatus.cancelled}
LOGISTICS_NEEDS_ASSIGNMENT = {LogisticsStatus.not_assigned, LogisticsStatus.carrier_search}

DEFAULT_RANGE_MONTHS = 6
MAX_TREND_BUCKETS = 24


def default_range(today: date) -> tuple[date, date]:
    """Last six whole months, which is what the page opens on."""
    month = today.month - (DEFAULT_RANGE_MONTHS - 1)
    year = today.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1), today


def months_between(start: date, end: date) -> list[str]:
    """Month buckets the chart draws, so it always matches the chosen range."""
    months = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month) and len(months) < MAX_TREND_BUCKETS:
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return months


def enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value or "")


def dec(value) -> Decimal:
    return Decimal(value or 0)


def month_key(value: date | datetime | None) -> str | None:
    return f"{value.year:04d}-{value.month:02d}" if value else None


def delivered_on(batch: DeliveryBatch) -> date | None:
    return batch.actual_delivery_date or batch.accepted_date


def batch_quantities(batch: DeliveryBatch) -> tuple[Decimal, Decimal, Decimal]:
    planned = sum((dec(i.planned_quantity) for i in batch.items), Decimal(0))
    loaded = sum((dec(i.loaded_quantity) for i in batch.items), Decimal(0))
    accepted = sum((dec(i.accepted_quantity) for i in batch.items), Decimal(0))
    return planned, loaded, accepted


def settled_difference(batch: DeliveryBatch) -> Decimal:
    """Accepted minus loaded, counting only items where both are known.

    Comparing the two totals directly would subtract the loaded weight of every
    lorry still on the road and report a huge phantom shortfall -- the number
    only means something once the customer has signed for the load.
    """
    return sum(
        (dec(i.accepted_quantity) - dec(i.loaded_quantity)
         for i in batch.items
         if i.accepted_quantity is not None and i.loaded_quantity is not None),
        Decimal(0),
    )


def is_late(batch: DeliveryBatch, today: date) -> bool:
    """Promised delivery date has passed while the batch is still open."""
    if batch.status in BATCH_CLOSED:
        return False
    target = batch.planned_delivery_date or (batch.logistics.planned_delivery_date if batch.logistics else None)
    return bool(target and target < today)


def filter_options(batches: list[DeliveryBatch]) -> dict:
    """Only the clients and routes that actually have batches -- a dropdown of
    all 267 clients would be unusable and mostly empty."""
    clients: dict[int, str] = {}
    routes: set[str] = set()
    for batch in batches:
        if batch.client:
            clients[batch.client.id] = batch.client.name
        if batch.logistics and batch.logistics.route_name:
            routes.add(batch.logistics.route_name)
    return {
        "clients": [{"id": cid, "name": name} for cid, name in sorted(clients.items(), key=lambda kv: kv[1] or "")],
        "routes": sorted(routes),
    }


def build_overview(
    batches: list[DeliveryBatch],
    transports: list[Transport],
    today: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    today = today or date.today()
    if date_from is None and date_to is None:
        date_from, date_to = default_range(today)
    date_to = date_to or today

    # --- what is happening right now (never narrowed by the date range) ---
    open_batches = [b for b in batches if b.status not in BATCH_CLOSED]
    on_the_move = [b for b in open_batches if b.status in BATCH_ON_THE_MOVE]
    problems = [b for b in open_batches if b.status in BATCH_PROBLEM]
    late = [b for b in open_batches if is_late(b, today)]
    open_trips = [b.logistics for b in open_batches if b.logistics and b.logistics.status not in LOGISTICS_CLOSED]
    needs_assignment = [t for t in open_trips if t.status in LOGISTICS_NEEDS_ASSIGNMENT or not t.vehicle_number]

    # --- what was finished inside the chosen range ---
    def in_range(value: date | None) -> bool:
        return bool(value and (date_from is None or value >= date_from) and value <= date_to)

    delivered = [b for b in batches if in_range(delivered_on(b))]
    created = [b for b in batches if in_range(b.batch_date)]

    planned_qty = loaded_qty = accepted_qty = difference_qty = Decimal(0)
    for batch in delivered:
        planned, loaded, accepted = batch_quantities(batch)
        planned_qty += planned
        loaded_qty += loaded
        accepted_qty += accepted
        difference_qty += settled_difference(batch)

    range_trips = [b.logistics for b in delivered if b.logistics]
    logistics_cost = sum((dec(t.cost_amount) for t in range_trips), Decimal(0))
    logistics_revenue = sum((dec(t.customer_price) for t in range_trips), Decimal(0))

    # --- status mix for the ring: three buckets a dispatcher actually acts on ---
    done = [b for b in batches if b.status in {BatchStatus.completed, BatchStatus.accepted}]
    unfinished = [b for b in open_batches if b.status not in BATCH_PROBLEM]
    mix_total = len(done) + len(unfinished) + len(problems)

    def share(count: int) -> float:
        return round(count / mix_total * 100, 1) if mix_total else 0.0

    months = months_between(date_from or (delivered[0].batch_date if delivered else today), date_to)
    created_by_month = defaultdict(int)
    delivered_by_month = defaultdict(int)
    for batch in batches:
        key = month_key(batch.batch_date)
        if key in months:
            created_by_month[key] += 1
        key = month_key(delivered_on(batch))
        if key in months:
            delivered_by_month[key] += 1

    clients: dict[str, dict] = {}
    for batch in batches:
        name = batch.client.name if batch.client else "—"
        row = clients.setdefault(
            name, {"client_name": name, "open": 0, "quantity": Decimal(0), "revenue": Decimal(0)}
        )
        if batch.status not in BATCH_CLOSED:
            row["open"] += 1
        if in_range(delivered_on(batch)):
            row["quantity"] += batch_quantities(batch)[2]
            if batch.logistics:
                row["revenue"] += dec(batch.logistics.customer_price)

    fleet_rows = [
        {
            "id": transport.id,
            "vehicle_number": transport.vehicle_number,
            "trailer_number": transport.trailer_number,
            "driver_name": transport.driver_name or (transport.driver.full_name if transport.driver else None),
            "driver_phone": transport.driver_phone,
            "vehicle_type": transport.vehicle_type,
            "capacity": transport.capacity,
            "status": enum_value(transport.status),
            "current_location": transport.current_location,
            "last_check_in": transport.check_ins[0].created_at if transport.check_ins else None,
        }
        for transport in transports
    ]

    return {
        "range": {"from": date_from, "to": date_to},
        "now": {
            "batches_total": len(batches),
            "active": len(open_batches),
            "on_the_move": len(on_the_move),
            "late": len(late),
            "problems": len(problems),
            "trips_need_assignment": len(needs_assignment),
            "fleet_total": len(transports),
            "fleet_active": sum(1 for t in transports if t.status not in UNAVAILABLE_STATUSES),
            "fleet_maintenance": sum(1 for t in transports if t.status in (TransportStatus.repair, TransportStatus.service)),
        },
        "result": {
            "delivered": len(delivered),
            "created": len(created),
            "planned_quantity": planned_qty,
            "loaded_quantity": loaded_qty,
            "accepted_quantity": accepted_qty,
            "quantity_difference": difference_qty,
            "logistics_cost": logistics_cost,
            "logistics_revenue": logistics_revenue,
            "logistics_margin": logistics_revenue - logistics_cost,
        },
        "status_mix": {
            "total": mix_total,
            "items": [
                {"key": "delivered", "count": len(done), "percent": share(len(done))},
                {"key": "unfinished", "count": len(unfinished), "percent": share(len(unfinished))},
                {"key": "problem", "count": len(problems), "percent": share(len(problems))},
            ],
        },
        "monthly": [
            {"month": m, "created": created_by_month.get(m, 0), "delivered": delivered_by_month.get(m, 0)}
            for m in months
        ],
        "fleet": sorted(fleet_rows, key=lambda row: (row["status"] != "active", row["vehicle_number"] or "")),
        "top_clients": sorted(
            [row for row in clients.values() if row["open"] or row["quantity"]],
            key=lambda row: (-row["quantity"], -row["open"], row["client_name"]),
        )[:LIST_LIMIT],
    }
