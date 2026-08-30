"""ABZ nuqtasi holatining tarixi

Revision ID: 20260830_0052
Revises: 20260830_0051
Create Date: 2026-08-30

Panel «o'tgan oyga nisbatan +3» deb yozadi. Buni hozirgi holatdan
hisoblab bo'lmaydi: o'tgan oy oxirida nuqta qaysi holatda bo'lganini
bilish kerak.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260830_0052"
down_revision = "20260830_0051"
branch_labels = None
depends_on = None

MSG_BASELINE = "Tarix yuritish boshlangunga qadar mavjud holat."


def upgrade() -> None:
    op.create_table(
        "delivery_point_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("point_id", sa.Integer(), sa.ForeignKey("delivery_points.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_status", sa.String(16)),
        sa.Column("new_status", sa.String(16), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("changed_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_delivery_point_status_history_point_id", "delivery_point_status_history", ["point_id"])
    op.create_index("ix_delivery_point_status_history_created_at", "delivery_point_status_history", ["created_at"])

    # Mavjud nuqtalarga bittadan boshlang'ich yozuv. Sanasi -- nuqta
    # yaratilgan payt: shunda «shu oyda qo'shildi» degan hisob to'g'ri
    # chiqadi va tarix yo'qdan paydo bo'lganday ko'rinmaydi.
    op.execute(
        sa.text(
            "INSERT INTO delivery_point_status_history (point_id, old_status, new_status, comment, changed_by, created_at)"
            " SELECT id, NULL, status, :comment, created_by_placeholder, created_at FROM ("
            "   SELECT id, status, created_at, NULL AS created_by_placeholder FROM delivery_points"
            " )"
        ).bindparams(comment=MSG_BASELINE)
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_point_status_history_created_at", table_name="delivery_point_status_history")
    op.drop_index("ix_delivery_point_status_history_point_id", table_name="delivery_point_status_history")
    op.drop_table("delivery_point_status_history")
