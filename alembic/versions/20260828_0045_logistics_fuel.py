"""Reys yoqilg'i hisobi va masofa ko'rsatkichlari

Revision ID: 20260828_0045
Revises: 20260826_0044
Create Date: 2026-08-28
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0045"
down_revision = "20260826_0044"
branch_labels = None
depends_on = None


NEW_COLUMNS = [
    ("fuel_before_liters", sa.Numeric(10, 2)),
    ("fuel_added_liters", sa.Numeric(10, 2)),
    ("fuel_after_liters", sa.Numeric(10, 2)),
    ("odometer_start_km", sa.Numeric(10, 1)),
    ("odometer_end_km", sa.Numeric(10, 1)),
    ("gps_distance_km", sa.Numeric(10, 2)),
    ("planned_distance_km", sa.Numeric(10, 2)),
]


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        for name, column_type in NEW_COLUMNS:
            batch.add_column(sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        for name, _ in NEW_COLUMNS:
            batch.drop_column(name)
