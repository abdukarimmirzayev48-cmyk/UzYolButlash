"""Normalise units, the remaining-payment clause and one rounded item

Revision ID: 20260820_0040
Revises: 20260820_0039
Create Date: 2026-08-20

Three small inconsistencies that all come from the same cause -- every form
supplied its own default and nothing reconciled them:

* **unit**: the contract wizard wrote "t" while the child forms and the PDF
  parser wrote "tonna". Same unit, two spellings, so any grouping by unit
  splits in two.
* **remaining_payment_rule**: four different texts on file -- an English
  default, two Uzbek wordings, and a fragment the parser cut out of the middle
  of a payment clause. The English default is now Uzbek in the model, and the
  rows are brought onto it. The parser fragment is debris and goes too.
* one contract item was stored rounded to whole so'm while its three
  duplicates kept the kopeks, and its VAT was then not 12% of its own subtotal.
  The inclusive total (195 000 000) is the authoritative figure, so the base
  and the tax are derived back out of it exactly as the parser now does.

Totals are not changed: every row here already sums to the same
total_with_vat.
"""

from decimal import Decimal, ROUND_HALF_UP

from alembic import op
import sqlalchemy as sa

from backend.app.models.contract import MSG_REMAINING_PAYMENT_RULE

revision = "20260820_0040"
down_revision = "20260820_0039"
branch_labels = None
depends_on = None

MONEY = Decimal("0.01")
# "t" is how the wizard wrote it; "tonna" is what everything else uses.
UNIT_ALIASES = {"t": "tonna", "т": "tonna", "тонна": "tonna"}
UNIT_TABLES = ("contract_items", "order_items", "delivery_batch_items")


def upgrade() -> None:
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}

    for table in UNIT_TABLES:
        if table not in existing:
            continue
        for alias, canonical in UNIT_ALIASES.items():
            bind.execute(
                sa.text(f"UPDATE {table} SET unit = :canonical WHERE lower(trim(unit)) = :alias"),
                {"canonical": canonical, "alias": alias},
            )

    # Everything that is not already the agreed wording, including the parser
    # fragment, becomes the agreed wording.
    if "contract_payment_terms" in existing:
        bind.execute(
            sa.text(
                "UPDATE contract_payment_terms SET remaining_payment_rule = :rule "
                "WHERE remaining_payment_rule IS NULL OR remaining_payment_rule <> :rule"
            ),
            {"rule": MSG_REMAINING_PAYMENT_RULE},
        )

    # Re-derive base and tax from the inclusive total wherever the stored tax is
    # not the stated rate of the stored base.
    rows = bind.execute(
        sa.text(
            "SELECT id, subtotal, vat_rate, vat_amount, total_with_vat FROM contract_items "
            "WHERE total_with_vat IS NOT NULL AND total_with_vat > 0"
        )
    ).fetchall()
    for row_id, subtotal, vat_rate, vat_amount, total in rows:
        subtotal = Decimal(str(subtotal or 0))
        rate = Decimal(str(vat_rate or 0))
        stored_vat = Decimal(str(vat_amount or 0))
        total = Decimal(str(total or 0))
        expected_vat = (subtotal * rate / Decimal("100")).quantize(MONEY, rounding=ROUND_HALF_UP)
        if stored_vat == expected_vat:
            continue
        base = (total / (Decimal("1") + rate / Decimal("100"))).quantize(MONEY, rounding=ROUND_HALF_UP)
        tax = (total - base).quantize(MONEY, rounding=ROUND_HALF_UP)
        bind.execute(
            sa.text("UPDATE contract_items SET subtotal = :base, vat_amount = :tax WHERE id = :id"),
            {"base": str(base), "tax": str(tax), "id": row_id},
        )
        bind.execute(
            sa.text(
                "UPDATE contracts SET subtotal_amount = :base, vat_amount = :tax "
                "WHERE id = (SELECT contract_id FROM contract_items WHERE id = :id)"
            ),
            {"base": str(base), "tax": str(tax), "id": row_id},
        )


def downgrade() -> None:
    # The previous values were inconsistent; there is nothing worth restoring.
    pass
