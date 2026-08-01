"""attendance check-out time

Revision ID: 20260707_0017
Revises: 20260706_0016
Create Date: 2026-07-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0017"
down_revision = "20260706_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attendance_records", sa.Column("check_out_time", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("attendance_records", "check_out_time")
