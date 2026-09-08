"""Reysning o'lchangan masofasi

Revision ID: 20260909_0064
Revises: 20260909_0063
Create Date: 2026-09-09

Monitoringdan olingan haqiqiy probeg. Qo'lda kiritiladigan `distance_km`
dan alohida saqlanadi: biri odam aytgani, ikkinchisi tizim o'lchagani --
ularni solishtirib ko'rish kerak bo'ladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0064"
down_revision = "20260909_0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("measured_distance_km", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("measured_distance_km")
