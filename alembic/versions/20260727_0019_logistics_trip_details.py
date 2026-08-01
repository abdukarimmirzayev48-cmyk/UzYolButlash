"""logistics trip details

Revision ID: 20260727_0019
Revises: 20260722_0018
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0019"
down_revision = "20260722_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("logistics", sa.Column("route_name", sa.String(length=255), nullable=True))
    op.add_column("logistics", sa.Column("distance_km", sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("loaded_mileage_km", sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("empty_mileage_km", sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("fuel_consumption_liters", sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("fuel_cost_amount", sa.Numeric(precision=18, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("driver_wage_amount", sa.Numeric(precision=18, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("esp_tax_percent", sa.Numeric(precision=5, scale=2), nullable=True, server_default="12"))


def downgrade() -> None:
    op.drop_column("logistics", "esp_tax_percent")
    op.drop_column("logistics", "driver_wage_amount")
    op.drop_column("logistics", "fuel_cost_amount")
    op.drop_column("logistics", "fuel_consumption_liters")
    op.drop_column("logistics", "empty_mileage_km")
    op.drop_column("logistics", "loaded_mileage_km")
    op.drop_column("logistics", "distance_km")
    op.drop_column("logistics", "route_name")
