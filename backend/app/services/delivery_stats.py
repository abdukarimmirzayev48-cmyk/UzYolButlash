"""Aggregates for the "Yetkazib berish" module overview.

Same approach as task_stats: load the rows once with their relationships and
count in Python. The delivery tables are small (batches, one logistics record
each, a handful of trucks) and this keeps the numbers on the overview provably
the same objects the batch and logistics lists show.

Two kinds of filter, deliberately treated differently:

* **client / route** narrow *which* of the business you are looking at, so they
  apply to everything on the page.
* **period** narrows *when*, so it applies only to results that already
  happened. Operational figures -- what is on the road, what is late, what
  still needs a lorry -- always mean "right now". Letting a date range shrink
  them would hide real, open problems behind a filter, which is exactly the
  kind of number a dispatcher must never miss.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from backend.app.models.delivery import BatchStatus, DeliveryBatch, LogisticsStatus
from backend.app.models.transport import Transport, TransportStatus

TREND_MONTHS = 6
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
BATCH_BEFORE_LOADING = {
    BatchStatus.planned,
    BatchStatus.supplier_preparing,
    BatchStatus.ready_for_loading,
    BatchStatus.waiting_payment,
}
# Things a dispatcher has to act on.
BATCH_PROBLEM = {BatchStatus.issue, BatchStatus.quantity_difference}

LOGISTICS_CLOSED = {LogisticsStatus.completed, LogisticsStatus.cancelled}
LOGISTICS_NEEDS_ASSIGNMENT = {LogisticsStatus.not_assigned, LogisticsStatus.carrier_search}

PERIODS = ("month", "quarter", "year", "all")


def period_start(period: str | None, today: date) -> date | None:
    """First day covered by the chosen period; None means "no limit"."""
    if period == "month":
        return today.replace(day=1)
    if period == "quarter":
        month = today.month - 2
        year = today.year
        if month <= 0:
            month += 12
            year -= 1
        return date(year, month, 1)
    if period == "year":
        return date(today.year, 1, 1)
    return None


def enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value or "")


def dec(value) -> Decimal:
    return Decimal(value or 0)


def month_key(value: date | datetime | None) -> str | None:
    return f"{value.year:04d}-{value.month:02d}" if value else None


def recent_months(today: date, count: int = TREND_MONTHS) -> list[str]:
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(months))


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


def batch_brief(batch: DeliveryBatch, today: date) -> dict:
    planned, loaded, accepted = batch_quantities(batch)
    target = batch.planned_delivery_date or (batch.logistics.planned_delivery_date if batch.logistics else None)
    return {
        "id": batch.id,
        "batch_number": batch.batch_number,
        "status": enum_value(batch.status),
        "client_name": batch.client.name if batch.client else None,
        "order_number": batch.order.order_number if batch.order else None,
        "supplier_name": batch.supplier_name,
        "planned_delivery_date": target,
        "days_late": (today - target).days if target and target < today else None,
        "planned_quantity": planned,
        "loaded_quantity": loaded,
        "accepted_quantity": accepted,
        "vehicle_number": batch.logistics.vehicle_number if batch.logistics else None,
        "driver_name": batch.logistics.driver_name if batch.logistics else None,
        "carrier_name": batch.logistics.carrier_name if batch.logistics else None,
        "route_name": batch.logistics.route_name if batch.logistics else None,
        "logistics_status": enum_value(batch.logistics.status) if batch.logistics else None,
    }


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
    period: str = "year",
) -> dict:
    today = today or date.today()
    start = period_start(period, today)

    # --- what is happening right now (never narrowed by the period) ---
    open_batches = [b for b in batches if b.status not in BATCH_CLOSED]
    on_the_move = [b for b in open_batches if b.status in BATCH_ON_THE_MOVE]
    before_loading = [b for b in open_batches if b.status in BATCH_BEFORE_LOADING]
    problems = [b for b in open_batches if b.status in BATCH_PROBLEM]
    late = [b for b in open_batches if is_late(b, today)]

    open_trips = [b.logistics for b in open_batches if b.logistics and b.logistics.status not in LOGISTICS_CLOSED]
    needs_assignment = [t for t in open_trips if t.status in LOGISTICS_NEEDS_ASSIGNMENT or not t.vehicle_number]

    # --- what was finished inside the chosen window ---
    in_period = [
        b for b in batches
        if delivered_on(b) and (start is None or delivered_on(b) >= start)
    ]
    created_in_period = [b for b in batches if start is None or b.batch_date >= start]

    planned_qty = loaded_qty = accepted_qty = difference_qty = Decimal(0)
    for batch in in_period:
        planned, loaded, accepted = batch_quantities(batch)
        planned_qty += planned
        loaded_qty += loaded
        accepted_qty += accepted
        difference_qty += settled_difference(batch)

    period_trips = [b.logistics for b in in_period if b.logistics]
    logistics_cost = sum((dec(t.cost_amount) for t in period_trips), Decimal(0))
    logistics_revenue = sum((dec(t.customer_price) for t in period_trips), Decimal(0))

    # --- current status mix, over every batch (a state, not a result) ---
    batch_status_counts = {status.value: 0 for status in BatchStatus}
    for batch in batches:
        batch_status_counts[enum_value(batch.status)] = batch_status_counts.get(enum_value(batch.status), 0) + 1
    logistics_status_counts = {status.value: 0 for status in LogisticsStatus}
    for batch in batches:
        if batch.logistics:
            key = enum_value(batch.logistics.status)
            logistics_status_counts[key] = logistics_status_counts.get(key, 0) + 1

    # The trend is a shape over time, so it always shows the same six months --
    # otherwise "this month" would render a single bar and read as a bug.
    months = recent_months(today)
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
    for batch in in_period:
        name = batch.client.name if batch.client else "—"
        row = clients.setdefault(name, {"client_name": name, "batches": 0, "quantity": Decimal(0), "revenue": Decimal(0)})
        row["batches"] += 1
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
        "period": {"key": period, "from": start, "to": today},
        "now": {
            "batches_total": len(batches),
            "batches_open": len(open_batches),
            "on_the_move": len(on_the_move),
            "before_loading": len(before_loading),
            "late": len(late),
            "problems": len(problems),
            "trips_open": len(open_trips),
            "trips_need_assignment": len(needs_assignment),
            "fleet_total": len(transports),
            "fleet_active": sum(1 for t in transports if t.status == TransportStatus.active),
            "fleet_maintenance": sum(1 for t in transports if t.status == TransportStatus.maintenance),
        },
        "result": {
            "delivered": len(in_period),
            "created": len(created_in_period),
            "planned_quantity": planned_qty,
            "loaded_quantity": loaded_qty,
            "accepted_quantity": accepted_qty,
            "quantity_difference": difference_qty,
            "logistics_cost": logistics_cost,
            "logistics_revenue": logistics_revenue,
            "logistics_margin": logistics_revenue - logistics_cost,
        },
        "by_batch_status": [{"status": key, "count": value} for key, value in batch_status_counts.items()],
        "by_logistics_status": [{"status": key, "count": value} for key, value in logistics_status_counts.items()],
        "monthly": [
            {"month": m, "created": created_by_month.get(m, 0), "delivered": delivered_by_month.get(m, 0)}
            for m in months
        ],
        "on_the_move_batches": [
            batch_brief(b, today) for b in sorted(on_the_move, key=lambda b: b.planned_delivery_date or date.max)[:LIST_LIMIT]
        ],
        "late_batches": [
            batch_brief(b, today) for b in sorted(late, key=lambda b: b.planned_delivery_date or date.max)[:LIST_LIMIT]
        ],
        "problem_batches": [batch_brief(b, today) for b in problems[:LIST_LIMIT]],
        "unassigned_trips": [batch_brief(t.batch, today) for t in needs_assignment[:LIST_LIMIT] if t.batch],
        "top_clients": sorted(clients.values(), key=lambda row: (-row["quantity"], row["client_name"]))[:LIST_LIMIT],
        "fleet": sorted(fleet_rows, key=lambda row: (row["status"] != "active", row["vehicle_number"] or "")),
    }
