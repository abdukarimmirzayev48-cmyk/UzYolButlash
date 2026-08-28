"""Reys yuk nazorati: tarozi, plomba, temperatura va tekshiruv

Revision ID: 20260828_0048
Revises: 20260828_0047
Create Date: 2026-08-28
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0048"
down_revision = "20260828_0047"
branch_labels = None
depends_on = None


NEW_COLUMNS = [
    ("gross_weight_tons", sa.Numeric(18, 3), None),
    ("tare_weight_tons", sa.Numeric(18, 3), None),
    ("loading_seal", sa.String(64), None),
    ("unloading_seal", sa.String(64), None),
    ("loading_temperature_c", sa.Numeric(6, 1), None),
    ("unloading_temperature_c", sa.Numeric(6, 1), None),
    ("approved_by", sa.String(255), None),
    ("checked_by", sa.String(255), None),
    ("check_decision", sa.Text(), None),
]


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        for name, column_type, default in NEW_COLUMNS:
            batch.add_column(sa.Column(name, column_type, nullable=True, server_default=default))
        batch.add_column(sa.Column("check_result", sa.String(32), nullable=False, server_default="not_checked"))
    op.create_index("ix_logistics_check_result", "logistics", ["check_result"])


def downgrade() -> None:
    op.drop_index("ix_logistics_check_result", table_name="logistics")
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("check_result")
        for name, _, _ in NEW_COLUMNS:
            batch.drop_column(name)
