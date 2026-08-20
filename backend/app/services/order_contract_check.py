"""How far an order's price has moved from the contract it belongs to.

The contract fixes what the customer pays for the goods. The order adds a
markup and a logistics charge on top and nothing ever compared the two, so an
order could bill 4.46% above a fixed-price contract with no note anywhere. The
invoice amount is prefilled from the order total, so the difference reaches the
customer -- and the contract's own "remaining to pay" can then never agree with
the invoices raised against it.

Worth being precise about where the difference comes from, because the three
causes need different answers:

* a **line price** that differs from the contract line is a mistake -- the
  contract says what a tonne costs;
* a **markup** is a decision someone made, correct or not, and it lands on the
  customer's invoice;
* a **logistics charge** is legitimate when the contract says transport is
  invoiced separately, and is a divergence when the contract says the price
  includes it.

Nothing here blocks anything. It reports, because which of these is acceptable
is a commercial question, not a rule this module can settle.
"""

from dataclasses import dataclass, field
from decimal import Decimal

# Rounding noise, not a price difference.
TOLERANCE = Decimal("1")

MSG_LINE_PRICE = "Buyurtma narxi shartnoma narxidan farq qiladi"
MSG_MARKUP = "Shartnoma narxi ustiga ustama qo'shilgan"
MSG_LOGISTICS_INCLUDED = "Shartnomada transport narxga kiritilgan, lekin buyurtmada alohida hisoblangan"


@dataclass
class OrderContractCheck:
    contract_goods_amount: Decimal = Decimal("0")
    order_goods_amount: Decimal = Decimal("0")
    goods_difference: Decimal = Decimal("0")
    goods_difference_percent: Decimal = Decimal("0")
    markup_amount: Decimal = Decimal("0")
    logistics_price: Decimal = Decimal("0")
    charged_total: Decimal = Decimal("0")
    # What the contract supports: the goods, plus transport when the contract
    # says transport is invoiced separately.
    contract_supported_total: Decimal = Decimal("0")
    excess_amount: Decimal = Decimal("0")
    excess_percent: Decimal = Decimal("0")
    transport_separate: bool = False
    warnings: list[str] = field(default_factory=list)
    lines: list[dict] = field(default_factory=list)


def money_text(value: Decimal) -> str:
    """Grouped with spaces, and without the currency word.

    The value half of a warning is rendered untranslated -- it is whatever the
    data says -- so a currency word appended here would sit in Latin inside a
    Cyrillic sentence. The comparison table below the warning spells the sums
    out properly.
    """
    return f"{value:,.0f}".replace(",", "\u00a0")


def percent_of(part: Decimal, whole: Decimal) -> Decimal:
    if not whole:
        return Decimal("0")
    return (part / whole * Decimal("100")).quantize(Decimal("0.01"))


def build_check(
    *,
    items: list[dict],
    markup_amount: Decimal,
    logistics_price: Decimal,
    charged_total: Decimal,
    transport_separate: bool,
) -> OrderContractCheck:
    """`items` carries one dict per order line:

    {product_name, quantity, unit_price, vat_rate, contract_unit_price}

    contract_unit_price is None for a line not tied to a contract line -- an
    extra the contract never mentioned, which is itself worth saying.
    """
    check = OrderContractCheck(transport_separate=transport_separate)

    for item in items:
        quantity = Decimal(item.get("quantity") or 0)
        order_price = Decimal(item.get("unit_price") or 0)
        contract_price = item.get("contract_unit_price")
        vat_rate = Decimal(item.get("vat_rate") or 0)
        vat_factor = Decimal("1") + vat_rate / Decimal("100")

        order_line = (quantity * order_price * vat_factor).quantize(Decimal("0.01"))
        check.order_goods_amount += order_line

        if contract_price is None:
            check.lines.append(
                {
                    "product_name": item.get("product_name"),
                    "order_unit_price": order_price,
                    "contract_unit_price": None,
                    "difference_percent": Decimal("0"),
                    "linked": False,
                }
            )
            continue

        contract_price = Decimal(contract_price)
        contract_line = (quantity * contract_price * vat_factor).quantize(Decimal("0.01"))
        check.contract_goods_amount += contract_line
        difference_percent = percent_of(order_price - contract_price, contract_price)
        check.lines.append(
            {
                "product_name": item.get("product_name"),
                "order_unit_price": order_price,
                "contract_unit_price": contract_price,
                "difference_percent": difference_percent,
                "linked": True,
            }
        )
        if abs(order_price - contract_price) > TOLERANCE:
            check.warnings.append(f"{MSG_LINE_PRICE}: {item.get('product_name')} — {difference_percent}%")

    check.markup_amount = Decimal(markup_amount or 0)
    check.logistics_price = Decimal(logistics_price or 0)
    check.charged_total = Decimal(charged_total or 0)
    check.goods_difference = (check.order_goods_amount - check.contract_goods_amount).quantize(Decimal("0.01"))
    check.goods_difference_percent = percent_of(check.goods_difference, check.contract_goods_amount)

    supported = check.contract_goods_amount
    if transport_separate:
        supported += check.logistics_price
    check.contract_supported_total = supported.quantize(Decimal("0.01"))
    check.excess_amount = (check.charged_total - check.contract_supported_total).quantize(Decimal("0.01"))
    check.excess_percent = percent_of(check.excess_amount, check.contract_supported_total)

    if check.markup_amount > TOLERANCE:
        check.warnings.append(f"{MSG_MARKUP}: {money_text(check.markup_amount)}")
    if check.logistics_price > TOLERANCE and not transport_separate:
        check.warnings.append(f"{MSG_LOGISTICS_INCLUDED}: {money_text(check.logistics_price)}")

    return check
