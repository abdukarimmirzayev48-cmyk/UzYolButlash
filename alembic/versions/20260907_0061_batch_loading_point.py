"""Partiyaga yuklash nuqtasi

Revision ID: 20260907_0061
Revises: 20260906_0060
Create Date: 2026-09-07

Yuklash manzili erkin matn edi va ta'minotchi kartochkasidan ko'chirilardi:
bitta bazaning manzili har partiyada boshqacha yozilishi mumkin edi. Endi u
ham ABZ/stansiya ma'lumotnomasidan tanlanadi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260907_0061"
down_revision = "20260906_0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_batches") as batch:
        batch.add_column(sa.Column("loading_point_id", sa.Integer(), nullable=True))
    op.create_index("ix_delivery_batches_loading_point_id", "delivery_batches", ["loading_point_id"])


def downgrade() -> None:
    op.drop_index("ix_delivery_batches_loading_point_id", table_name="delivery_batches")
    with op.batch_alter_table("delivery_batches") as batch:
        batch.drop_column("loading_point_id")
