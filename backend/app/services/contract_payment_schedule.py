"""When a contract's money is actually due, and what is late.

The payment terms held the numbers -- "advance within 10 days", "batch payment
within 3" -- and the interface repeated them back as numbers. Nobody ever
turned them into a date. So a contract whose advance had been due since January
showed the same mild note in August that it showed on day one: "the advance has
not arrived yet". True, and useless: 1 428 000 000 so'm was 200 days late and
nothing on the screen said so.

The terms are used elsewhere to prefill an invoice's due date, so the arithmetic
already existed -- it was only ever applied forwards, at the moment an invoice
was created, and never looked back at.

Two clocks, matching how the invoice prefill already treats them:

* the **advance** is counted in banking days from the contract date, because
  that is how these contracts word it and how the advance invoice prefill
  computes it;
* a **batch payment** is counted in calendar days from the day the customer
  accepted the batch -- there is nothing to pay for until then.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal


MSG_ADVANCE_LABEL = "Avans to'lovi"
MSG_INVOICE_LABEL = "Hisob-faktura"


def add_business_days(start: date, days: int) -> date:
    """Skip Saturdays and Sundays, like the invoice due-date prefill does."""
    current = start
    remaining = max(0, days)
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def days_late(due: date | None, today: date) -> int:
    """Whole days past due; 0 while there is still time."""
    if due is None:
        return 0
    return max(0, (today - due).days)


@dataclass
class DueItem:
    """One thing that has to be paid by a date."""

    kind: str  # advance | batch
    label: str
    due_date: date | None
    amount: Decimal
    paid_amount: Decimal
    overdue_days: int

    @property
    def outstanding(self) -> Decimal:
        return max(Decimal("0"), self.amount - self.paid_amount)

    @property
    def is_overdue(self) -> bool:
        return self.overdue_days > 0 and self.outstanding > 0


def advance_due_date(contract_date: date | None, advance_due_days: int | None) -> date | None:
    if contract_date is None:
        return None
    return add_business_days(contract_date, advance_due_days or 0)


def build_schedule(
    *,
    contract_date: date | None,
    advance_due_days: int | None,
    advance_amount: Decimal,
    invoices: list[dict],
    today: date,
) -> list[DueItem]:
    """Everything with a deadline on this contract, oldest deadline first.

    An issued invoice is the demand for payment, so it brings its own due date
    and amounts. The advance is different: it is owed from the contract date
    whether or not anyone has issued the invoice yet, and on this data that is
    the usual case -- the contract that was 200 days late had no advance invoice
    at all, which is exactly why nothing noticed.

    `invoices` carries one dict per non-cancelled invoice:
    {number, type, due_date, amount, paid_amount}.
    """
    items: list[DueItem] = []
    advance_invoices = [i for i in invoices if i.get("type") == "advance"]

    if advance_amount > 0 and not advance_invoices:
        due = advance_due_date(contract_date, advance_due_days)
        items.append(
            DueItem(
                kind="advance",
                label=MSG_ADVANCE_LABEL,
                due_date=due,
                amount=advance_amount,
                paid_amount=Decimal("0"),
                overdue_days=days_late(due, today),
            )
        )

    for invoice in invoices:
        amount = Decimal(invoice.get("amount") or 0)
        paid = Decimal(invoice.get("paid_amount") or 0)
        if amount <= 0:
            continue
        due = invoice.get("due_date")
        items.append(
            DueItem(
                kind="advance" if invoice.get("type") == "advance" else "invoice",
                label=invoice.get("number") or MSG_INVOICE_LABEL,
                due_date=due,
                amount=amount,
                paid_amount=paid,
                overdue_days=days_late(due, today) if paid < amount else 0,
            )
        )

    # Undated entries last: they are waiting on something else, not on money.
    return sorted(items, key=lambda item: (item.due_date is None, item.due_date or date.max))


def overdue_summary(items: list[DueItem]) -> dict:
    """What the card needs to say in one line."""
    overdue = [item for item in items if item.is_overdue]
    return {
        "overdue_count": len(overdue),
        "overdue_amount": sum((item.outstanding for item in overdue), Decimal("0")),
        "max_overdue_days": max((item.overdue_days for item in overdue), default=0),
    }
