"""TO va ta'mir arizalari jurnali

Revision ID: 20260828_0047
Revises: 20260828_0046
Create Date: 2026-08-28

Bu bo'lim umuman yo'q edi: mashina ta'mirda ekanini faqat bitta bayroq
aytardi. Nima buzilgani, qancha turib qolgani, qancha pul ketgani va kim
tuzatgani hech qayerda yozilmasdi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0047"
down_revision = "20260828_0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transport_repairs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repair_number", sa.String(64), nullable=False),
        sa.Column("transport_id", sa.Integer(), sa.ForeignKey("transports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=False),
        sa.Column("breakdown_location", sa.String(255)),
        sa.Column("source", sa.String(32), nullable=False, server_default="driver"),
        sa.Column("category", sa.String(32), nullable=False, server_default="other"),
        sa.Column("description", sa.Text()),
        sa.Column("severity", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("can_move", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("downtime_started_at", sa.DateTime()),
        sa.Column("downtime_finished_at", sa.DateTime()),
        sa.Column("repair_place", sa.String(255)),
        sa.Column("work_done", sa.Text()),
        sa.Column("contractor", sa.String(255)),
        sa.Column("act_number", sa.String(128)),
        sa.Column("document_url", sa.String(500)),
        sa.Column("odometer_km", sa.Numeric(10, 1)),
        sa.Column("labour_cost", sa.Numeric(18, 2)),
        sa.Column("responsible_name", sa.String(255)),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("result", sa.Text()),
        sa.Column("delay_reason", sa.String(255)),
        sa.Column("note", sa.Text()),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("repair_number", "transport_id", "opened_at", "category", "severity", "status"):
        op.create_index(f"ix_transport_repairs_{column}", "transport_repairs", [column])

    op.create_table(
        "transport_repair_parts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repair_id", sa.Integer(), sa.ForeignKey("transport_repairs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("unit", sa.String(32)),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(18, 2)),
        sa.Column("total_amount", sa.Numeric(18, 2)),
        sa.Column("note", sa.Text()),
    )
    op.create_index("ix_transport_repair_parts_repair_id", "transport_repair_parts", ["repair_id"])


def downgrade() -> None:
    op.drop_index("ix_transport_repair_parts_repair_id", table_name="transport_repair_parts")
    op.drop_table("transport_repair_parts")
    for column in ("repair_number", "transport_id", "opened_at", "category", "severity", "status"):
        op.drop_index(f"ix_transport_repairs_{column}", table_name="transport_repairs")
    op.drop_table("transport_repairs")
