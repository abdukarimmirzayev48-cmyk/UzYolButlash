"""Aggregates for the "Yetkazib berish" module overview.

Same approach as task_stats: load the rows once with their relationships and
count in Python. The delivery tables are small (batches, one logistics record
each, a handful of trucks) and this keeps the numbers on the overview provably
the same objects the batch and logistics lists show.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from backend.app.models.delivery import BatchStatus, DeliveryBatch, Logistics, LogisticsStatus
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


def build_overview(batches: list[DeliveryBatch], transports: list[Transport], today: date | None = None) -> dict:
    today = today or date.today()

    open_batches = [b for b in batches if b.status not in BATCH_CLOSED]
    on_the_move = [b for b in open_batches if b.status in BATCH_ON_THE_MOVE]
    before_loading = [b for b in open_batches if b.status in BATCH_BEFORE_LOADING]
    problems = [b for b in open_batches if b.status in BATCH_PROBLEM]
    late = [b for b in open_batches if is_late(b, today)]
    completed = [b for b in batches if b.status == BatchStatus.completed]
    completed_this_month = [
        b for b in completed if month_key(b.actual_delivery_date or b.accepted_date) == month_key(today)
    ]

    planned_qty = loaded_qty = accepted_qty = difference_qty = Decimal(0)
    for batch in batches:
        planned, loaded, accepted = batch_quantities(batch)
        planned_qty += planned
        loaded_qty += loaded
        accepted_qty += accepted
        difference_qty += settled_difference(batch)

    trips = [b.logistics for b in batches if b.logistics]
    open_trips = [t for t in trips if t.status not in LOGISTICS_CLOSED]
    needs_assignment = [t for t in open_trips if t.status in LOGISTICS_NEEDS_ASSIGNMENT or not t.vehicle_number]
    logistics_cost = sum((dec(t.cost_amount) for t in trips), Decimal(0))
    logistics_revenue = sum((dec(t.customer_price) for t in trips), Decimal(0))

    batch_status_counts = {status.value: 0 for status in BatchStatus}
    for batch in batches:
        batch_status_counts[enum_value(batch.status)] = batch_status_counts.get(enum_value(batch.status), 0) + 1
    logistics_status_counts = {status.value: 0 for status in LogisticsStatus}
    for trip in trips:
        logistics_status_counts[enum_value(trip.status)] = logistics_status_counts.get(enum_value(trip.status), 0) + 1

    months = recent_months(today)
    created_by_month = defaultdict(int)
    delivered_by_month = defaultdict(int)
    quantity_by_month = defaultdict(Decimal)
    for batch in batches:
        key = month_key(batch.batch_date)
        if key in months:
            created_by_month[key] += 1
        key = month_key(batch.actual_delivery_date or batch.accepted_date)
        if key in months:
            delivered_by_month[key] += 1
            quantity_by_month[key] += batch_quantities(batch)[2]

    clients: dict[str, dict] = {}
    for batch in batches:
        name = batch.client.name if batch.client else "—"
        row = clients.setdefault(name, {"client_name": name, "batches": 0, "quantity": Decimal(0), "open": 0})
        row["batches"] += 1
        row["quantity"] += batch_quantities(batch)[2]
        if batch.status not in BATCH_CLOSED:
            row["open"] += 1

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
        "summary": {
            "batches_total": len(batches),
            "batches_open": len(open_batches),
            "on_the_move": len(on_the_move),
            "before_loading": len(before_loading),
            "late": len(late),
            "problems": len(problems),
            "completed_total": len(completed),
            "completed_this_month": len(completed_this_month),
            "planned_quantity": planned_qty,
            "loaded_quantity": loaded_qty,
            "accepted_quantity": accepted_qty,
            "quantity_difference": difference_qty,
            "trips_total": len(trips),
            "trips_open": len(open_trips),
            "trips_need_assignment": len(needs_assignment),
            "logistics_cost": logistics_cost,
            "logistics_revenue": logistics_revenue,
            "logistics_margin": logistics_revenue - logistics_cost,
            "fleet_total": len(transports),
            "fleet_active": sum(1 for t in transports if t.status == TransportStatus.active),
            "fleet_maintenance": sum(1 for t in transports if t.status == TransportStatus.maintenance),
        },
        "by_batch_status": [{"status": key, "count": value} for key, value in batch_status_counts.items()],
        "by_logistics_status": [{"status": key, "count": value} for key, value in logistics_status_counts.items()],
        "monthly": [
            {
                "month": m,
                "created": created_by_month.get(m, 0),
                "delivered": delivered_by_month.get(m, 0),
                "quantity": quantity_by_month.get(m, Decimal(0)),
            }
            for m in months
        ],
        "on_the_move_batches": [
            batch_brief(b, today) for b in sorted(on_the_move, key=lambda b: b.planned_delivery_date or date.max)[:LIST_LIMIT]
        ],
        "late_batches": [
            batch_brief(b, today) for b in sorted(late, key=lambda b: b.planned_delivery_date or date.max)[:LIST_LIMIT]
        ],
        "problem_batches": [batch_brief(b, today) for b in problems[:LIST_LIMIT]],
        "unassigned_trips": [
            batch_brief(t.batch, today) for t in needs_assignment[:LIST_LIMIT] if t.batch
        ],
        "top_clients": sorted(clients.values(), key=lambda row: (-row["quantity"], row["client_name"]))[:LIST_LIMIT],
        "fleet": sorted(fleet_rows, key=lambda row: (row["status"] != "active", row["vehicle_number"] or "")),
    }
