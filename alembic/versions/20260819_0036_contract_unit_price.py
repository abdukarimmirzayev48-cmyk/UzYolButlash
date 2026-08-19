"""unit_price always excludes VAT, with four decimals

Revision ID: 20260819_0036
Revises: 20260819_0035
Create Date: 2026-08-19

Contracts entered through the wizard stored unit_price without VAT; contracts
parsed from a PDF stored it *with* VAT, because that is how the document states
it, and derived the subtotal back out of it. The same column therefore held two
different things, and quantity x unit_price no longer matched subtotal for the
parsed ones.

That was not only wrong in reports. recalculate_contract() rebuilds every
contract from quantity x unit_price on save, so opening one of those contracts
and saving it -- changing nothing -- rewrote a 195 000 000 contract as
218 400 000.

This migration puts every row on the same footing: unit_price = subtotal /
quantity, computed from the subtotal that was already correct. Rows that
already agreed are left untouched. subtotal, vat_amount and total_with_vat are
not changed by this migration -- they were right; only the per-unit figure
disagreed with them.
"""

from decimal import Decimal, ROUND_HALF_UP

from alembic import op
import sqlalchemy as sa

revision = "20260819_0036"
down_revision = "20260819_0035"
branch_labels = None
depends_on = None

UNIT = Decimal("0.0001")
# Anything under a so'm is rounding, not a difference in meaning.
TOLERANCE = Decimal("1")


def upgrade() -> None:
    with op.batch_alter_table("contract_items") as batch:
        batch.alter_column("unit_price", type_=sa.Numeric(18, 4), existing_nullable=False)

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, quantity, unit_price, subtotal FROM contract_items WHERE quantity > 0")
    ).fetchall()
    for row_id, quantity, unit_price, subtotal in rows:
        quantity = Decimal(str(quantity or 0))
        unit_price = Decimal(str(unit_price or 0))
        subtotal = Decimal(str(subtotal or 0))
        if not quantity or not subtotal:
            continue
        if abs(quantity * unit_price - subtotal) <= TOLERANCE:
            continue
        corrected = (subtotal / quantity).quantize(UNIT, rounding=ROUND_HALF_UP)
        bind.execute(
            sa.text("UPDATE contract_items SET unit_price = :price WHERE id = :id"),
            {"price": str(corrected), "id": row_id},
        )


def downgrade() -> None:
    # The pre-migration values cannot be reconstructed -- restoring the column
    # width is all that is meaningful here.
    with op.batch_alter_table("contract_items") as batch:
        batch.alter_column("unit_price", type_=sa.Numeric(18, 2), existing_nullable=False)
