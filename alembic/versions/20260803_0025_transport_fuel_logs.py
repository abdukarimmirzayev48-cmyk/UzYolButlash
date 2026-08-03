"""transport fuel logs

Revision ID: 20260803_0025
Revises: 20260802_0024
Create Date: 2026-08-03

Manual diesel control per transport: log fuel added and fuel consumed,
with a running balance computed from the two.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260803_0025"
down_revision = "20260802_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transport_fuel_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transport_id", sa.Integer(), sa.ForeignKey("transports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("entry_type", sa.Enum("added", "consumed", name="fuelentrytype"), nullable=False),
        sa.Column("amount_liters", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_transport_fuel_logs_transport_id", "transport_fuel_logs", ["transport_id"])
    op.create_index("ix_transport_fuel_logs_entry_date", "transport_fuel_logs", ["entry_date"])
    op.create_index("ix_transport_fuel_logs_entry_type", "transport_fuel_logs", ["entry_type"])


def downgrade() -> None:
    op.drop_index("ix_transport_fuel_logs_entry_type", table_name="transport_fuel_logs")
    op.drop_index("ix_transport_fuel_logs_entry_date", table_name="transport_fuel_logs")
    op.drop_index("ix_transport_fuel_logs_transport_id", table_name="transport_fuel_logs")
    op.drop_table("transport_fuel_logs")
