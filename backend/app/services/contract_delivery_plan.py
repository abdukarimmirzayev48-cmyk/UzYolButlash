"""Plan against actual: what a contract promised each month, and what arrived.

Without a schedule there is no such thing as "behind": a contract for 1 000
tonnes with 44 delivered and a year still to run tells you nothing on its own.
With one, every month has a number to miss.

Two figures per month, and the running totals matter more than either:

* **planned** comes from the contract schedule;
* **delivered** is what the customer actually accepted that month -- accepted,
  not loaded, because a lorry on the road is not a delivery.

Months are compared cumulatively. A month that under-delivers is not
necessarily a problem if the month before ran ahead; what matters is whether
the total owed by now has arrived.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

# Under a tonne is rounding between batches, not a shortfall.
TOLERANCE = Decimal("1")

MSG_BEHIND_PLAN = "Yetkazib berish rejasidan orqada"
MSG_NO_SCHEDULE = "Yetkazib berish grafigi kiritilmagan — rejaga nisbatan holatni aniqlab bo'lmaydi"


@dataclass
class PlanMonth:
    year: int
    month: int
    planned: Decimal
    delivered: Decimal
    planned_cumulative: Decimal
    delivered_cumulative: Decimal
    is_past: bool

    @property
    def difference(self) -> Decimal:
        return self.delivered_cumulative - self.planned_cumulative


@dataclass
class DeliveryPlan:
    months: list[PlanMonth] = field(default_factory=list)
    planned_total: Decimal = Decimal("0")
    delivered_total: Decimal = Decimal("0")
    # How much should have arrived by today, and how far off that is.
    due_by_now: Decimal = Decimal("0")
    behind_by: Decimal = Decimal("0")
    has_schedule: bool = False
    warnings: list[str] = field(default_factory=list)


def quantity_text(value: Decimal) -> str:
    text = f"{value:,.3f}".rstrip("0").rstrip(".")
    return text.replace(",", " ")


def build_plan(*, schedule: list[dict], deliveries: list[dict], today: date) -> DeliveryPlan:
    """`schedule` is [{year, month, quantity}]; `deliveries` is
    [{date, quantity}] of accepted quantities."""
    plan = DeliveryPlan(has_schedule=bool(schedule))

    delivered_by_month: dict[tuple[int, int], Decimal] = {}
    for delivery in deliveries:
        when = delivery.get("date")
        amount = Decimal(delivery.get("quantity") or 0)
        if when is None or amount <= 0:
            continue
        key = (when.year, when.month)
        delivered_by_month[key] = delivered_by_month.get(key, Decimal("0")) + amount
        plan.delivered_total += amount

    if not schedule:
        plan.warnings.append(MSG_NO_SCHEDULE)
        return plan

    # Every month that either side mentions, so a delivery in a month with no
    # plan is still visible rather than quietly dropped.
    periods = sorted({(row["year"], row["month"]) for row in schedule} | set(delivered_by_month))
    planned_by_month = {(row["year"], row["month"]): Decimal(row["quantity"] or 0) for row in schedule}

    planned_running = Decimal("0")
    delivered_running = Decimal("0")
    for year, month in periods:
        planned = planned_by_month.get((year, month), Decimal("0"))
        delivered = delivered_by_month.get((year, month), Decimal("0"))
        planned_running += planned
        delivered_running += delivered
        # A month counts as due once it is over.
        is_past = (year, month) < (today.year, today.month)
        plan.months.append(
            PlanMonth(
                year=year,
                month=month,
                planned=planned,
                delivered=delivered,
                planned_cumulative=planned_running,
                delivered_cumulative=delivered_running,
                is_past=is_past,
            )
        )
        if is_past:
            plan.due_by_now = planned_running

    plan.planned_total = planned_running
    plan.behind_by = max(Decimal("0"), plan.due_by_now - plan.delivered_total)
    if plan.behind_by > TOLERANCE:
        plan.warnings.append(f"{MSG_BEHIND_PLAN}: {quantity_text(plan.behind_by)}")
    return plan
