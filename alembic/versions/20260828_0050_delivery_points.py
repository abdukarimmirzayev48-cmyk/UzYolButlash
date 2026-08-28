"""ABZ nuqtalari ma'lumotnomasi

Revision ID: 20260828_0050
Revises: 20260828_0049
Create Date: 2026-08-28
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0050"
down_revision = "20260828_0049"
branch_labels = None
depends_on = None

# Nuqtaga ishora qiladigan jadvallar. Manzil ularning har birida qayta
# yozilmasin -- bittasiga ishora yetarli.
LINKED_TABLES = ["customer_requests", "contracts", "orders", "delivery_batches"]


def upgrade() -> None:
    op.create_table(
        "delivery_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(64)),
        sa.Column("point_type", sa.String(16), nullable=False, server_default="abz"),
        sa.Column("client_id", sa.Integer()),
        sa.Column("region", sa.String(255)),
        sa.Column("district", sa.String(255)),
        sa.Column("address", sa.Text()),
        sa.Column("latitude", sa.String(64)),
        sa.Column("longitude", sa.String(64)),
        sa.Column("responsible_name", sa.String(255)),
        sa.Column("responsible_position", sa.String(255)),
        sa.Column("responsible_phone", sa.String(64)),
        sa.Column("responsible_email", sa.String(255)),
        sa.Column("working_hours", sa.String(255)),
        sa.Column("tank_capacity_tons", sa.Numeric(18, 3)),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("name", "code", "point_type", "client_id", "region", "district", "responsible_phone", "is_active"):
        op.create_index(f"ix_delivery_points_{column}", "delivery_points", [column])

    for table in LINKED_TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("delivery_point_id", sa.Integer(), nullable=True))
        op.create_index(f"ix_{table}_delivery_point_id", table, ["delivery_point_id"])


def downgrade() -> None:
    for table in LINKED_TABLES:
        op.drop_index(f"ix_{table}_delivery_point_id", table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_column("delivery_point_id")
    for column in ("name", "code", "point_type", "client_id", "region", "district", "responsible_phone", "is_active"):
        op.drop_index(f"ix_delivery_points_{column}", table_name="delivery_points")
    op.drop_table("delivery_points")
