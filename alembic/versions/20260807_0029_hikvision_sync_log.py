"""hikvision sync log

Revision ID: 20260807_0029
Revises: 20260807_0028
Create Date: 2026-08-07

Adds hikvision_sync_logs, one row per completed sync run, so office staff
can see when the unattended LAN sync agent last ran without needing server
access. Starts empty -- no backfill needed.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260807_0029"
down_revision = "20260807_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hikvision_sync_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="agent"),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
        sa.Column("device_users_seen", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("employees_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("events_fetched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("days_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warnings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hikvision_sync_logs_id"), "hikvision_sync_logs", ["id"], unique=False)
    op.create_index(op.f("ix_hikvision_sync_logs_synced_at"), "hikvision_sync_logs", ["synced_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hikvision_sync_logs_synced_at"), table_name="hikvision_sync_logs")
    op.drop_index(op.f("ix_hikvision_sync_logs_id"), table_name="hikvision_sync_logs")
    op.drop_table("hikvision_sync_logs")
