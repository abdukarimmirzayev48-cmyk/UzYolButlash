"""logistics extra expenses (other, business trip)

Revision ID: 20260727_0021
Revises: 20260727_0020
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0021"
down_revision = "20260727_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("logistics", sa.Column("other_expenses_amount", sa.Numeric(precision=18, scale=2), nullable=True))
    op.add_column("logistics", sa.Column("business_trip_expenses_amount", sa.Numeric(precision=18, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column("logistics", "business_trip_expenses_amount")
    op.drop_column("logistics", "other_expenses_amount")
