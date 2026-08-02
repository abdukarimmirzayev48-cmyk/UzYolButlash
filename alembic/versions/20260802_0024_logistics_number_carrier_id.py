"""logistics number and carrier id

Revision ID: 20260802_0024
Revises: 20260731_0023
Create Date: 2026-08-02

These two columns exist on the Logistics model but were never given a
migration (likely added directly to a dev database at some point). This
caused a 500 on any deploy with a freshly-migrated database, since
`logistics.logistics_number` / `logistics.carrier_id` didn't exist.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260802_0024"
down_revision = "20260731_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("logistics", sa.Column("logistics_number", sa.String(length=128), nullable=True))
    op.create_index("ix_logistics_logistics_number", "logistics", ["logistics_number"], unique=True)
    op.add_column("logistics", sa.Column("carrier_id", sa.Integer(), nullable=True))
    op.create_index("ix_logistics_carrier_id", "logistics", ["carrier_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_logistics_carrier_id", table_name="logistics")
    op.drop_column("logistics", "carrier_id")
    op.drop_index("ix_logistics_logistics_number", table_name="logistics")
    op.drop_column("logistics", "logistics_number")
