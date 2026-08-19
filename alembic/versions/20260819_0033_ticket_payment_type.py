"""exchange ticket: spot / forward payment type

Revision ID: 20260819_0033
Revises: 20260819_0032
Create Date: 2026-08-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260819_0033"
down_revision = "20260819_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("exchange_tickets") as batch:
        batch.add_column(sa.Column("payment_type", sa.String(length=16), nullable=True))
    # Existing tickets all carry deferred terms (35-90 days), so they are
    # forward; the short ones are labelled spot on the same rule the form uses.
    op.execute("UPDATE exchange_tickets SET payment_type = CASE WHEN payment_term_days <= 5 THEN 'spot' ELSE 'forward' END")
    with op.batch_alter_table("exchange_tickets") as batch:
        batch.alter_column("payment_type", existing_type=sa.String(length=16), nullable=False)
        batch.create_index(op.f("ix_exchange_tickets_payment_type"), ["payment_type"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("exchange_tickets") as batch:
        batch.drop_index(op.f("ix_exchange_tickets_payment_type"))
        batch.drop_column("payment_type")
