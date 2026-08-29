"""ABZ nuqtasining holati va kunlik quvvati

Revision ID: 20260830_0051
Revises: 20260828_0050
Create Date: 2026-08-30

`is_active` ha yoki yo'q edi. Amalda oraliq holatlar bor: ABZ ishlayapti,
lekin e'tibor talab qiladi, yoki hali ochilmagan va rejada turibdi.
Ikkalasini ham «faol emas» deb belgilash ularni ro'yxatdan yashiradi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260830_0051"
down_revision = "20260828_0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_points") as batch:
        batch.add_column(sa.Column("status", sa.String(16), nullable=False, server_default="active"))
        batch.add_column(sa.Column("daily_capacity_tons", sa.Numeric(18, 3), nullable=True))
    op.create_index("ix_delivery_points_status", "delivery_points", ["status"])
    # Mavjud yozuvlar: faol bo'lganlari faol, qolgani faol emas.
    op.execute(sa.text("UPDATE delivery_points SET status = 'inactive' WHERE is_active = 0"))
    op.drop_index("ix_delivery_points_is_active", table_name="delivery_points")
    with op.batch_alter_table("delivery_points") as batch:
        batch.drop_column("is_active")


def downgrade() -> None:
    with op.batch_alter_table("delivery_points") as batch:
        batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    op.execute(sa.text("UPDATE delivery_points SET is_active = 0 WHERE status IN ('inactive', 'planned')"))
    op.create_index("ix_delivery_points_is_active", "delivery_points", ["is_active"])
    op.drop_index("ix_delivery_points_status", table_name="delivery_points")
    with op.batch_alter_table("delivery_points") as batch:
        batch.drop_column("status")
        batch.drop_column("daily_capacity_tons")
