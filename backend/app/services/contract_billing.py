"""How much of a contract has been billed to the customer, and how much is left.

The batch-payment invoice prefilled itself with the order total minus whatever
had already been invoiced *against that order*. The advance invoice is raised
against the contract and carries no order id, so it was invisible to that sum:
every batch invoice was offered at the full value of its batch, and the advance
ended up charged twice. On one contract that came to 9 298 120 000 so'm billed
against 7 191 400 000 owed -- over by 2 106 720 000, which is the advance to
the so'm.

The position has to be taken at the contract, because that is the level the
advance belongs to. What the customer owes is the sum of the orders raised
under the contract, including markup and logistics; what they have been asked
for is every non-cancelled invoice on it, of whatever type.
"""

from dataclasses import dataclass
from decimal import Decimal

MSG_OVER_BILLED = "Shartnoma bo'yicha ortiqcha hisob qo'yilgan"
MSG_ADVANCE_NOT_OFFSET = "Avans hisob-fakturasi partiya hisoblaridan chegirilmagan"


@dataclass
class BillingPosition:
    # Sum of the orders raised under the contract -- what the customer owes.
    billable: Decimal = Decimal("0")
    # Every non-cancelled invoice on the contract, whatever its type.
    invoiced: Decimal = Decimal("0")
    paid: Decimal = Decimal("0")
    advance_invoiced: Decimal = Decimal("0")
    advance_paid: Decimal = Decimal("0")

    @property
    def remaining_to_bill(self) -> Decimal:
        """What may still be invoiced without over-charging."""
        return self.billable - self.invoiced

    @property
    def over_billed(self) -> Decimal:
        return max(Decimal("0"), self.invoiced - self.billable)


def build_position(*, order_totals: list[Decimal], invoices: list[dict]) -> BillingPosition:
    """`invoices` carries one dict per non-cancelled invoice:
    {type, amount, paid_amount}."""
    position = BillingPosition()
    position.billable = sum((Decimal(value or 0) for value in order_totals), Decimal("0"))
    for invoice in invoices:
        amount = Decimal(invoice.get("amount") or 0)
        paid = Decimal(invoice.get("paid_amount") or 0)
        position.invoiced += amount
        position.paid += paid
        if invoice.get("type") == "advance":
            position.advance_invoiced += amount
            position.advance_paid += paid
    return position


def warnings_for(position: BillingPosition) -> list[str]:
    notes: list[str] = []
    if position.over_billed > 0:
        notes.append(f"{MSG_OVER_BILLED}: {money_text(position.over_billed)}")
    return notes


def money_text(value: Decimal) -> str:
    """Grouped with spaces and no currency word -- the value half of a warning
    is shown untranslated, so a Latin "so'm" would sit inside a Cyrillic
    sentence."""
    return f"{value:,.0f}".replace(",", " ")
