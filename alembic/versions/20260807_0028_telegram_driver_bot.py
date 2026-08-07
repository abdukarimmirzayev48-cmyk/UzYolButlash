"""telegram driver bot: employee pairing, transport check-ins, generic notification link

Revision ID: 20260807_0028
Revises: 20260803_0027
Create Date: 2026-08-07

Adds the fields needed for the driver-facing Telegram bot: a chat-id bridge
and one-time pairing code on Employee (same shape as the existing user_id
bridge), a new transport_checkins table for driver-submitted odometer/fuel
reports and stop/resume events, and a generic link_path on notifications so
the bell can point somewhere other than a task (e.g. a transport). All new
columns are nullable / the new table starts empty -- no backfill needed.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260807_0028"
down_revision = "20260803_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attendance_employees", sa.Column("telegram_chat_id", sa.String(length=64), nullable=True))
    op.add_column("attendance_employees", sa.Column("telegram_pairing_code", sa.String(length=32), nullable=True))
    op.add_column("attendance_employees", sa.Column("telegram_pairing_code_expires_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_attendance_employees_telegram_chat_id"), "attendance_employees", ["telegram_chat_id"], unique=True)
    op.create_index(op.f("ix_attendance_employees_telegram_pairing_code"), "attendance_employees", ["telegram_pairing_code"], unique=True)

    op.add_column("notifications", sa.Column("link_path", sa.String(length=255), nullable=True))

    op.create_table(
        "transport_checkins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transport_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("logistics_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.Enum("report", "stopped", "resumed", name="transportcheckinkind"), nullable=False),
        sa.Column("odometer_km", sa.Numeric(10, 1), nullable=True),
        sa.Column("odometer_photo_url", sa.String(length=500), nullable=True),
        sa.Column("fuel_liters", sa.Numeric(10, 2), nullable=True),
        sa.Column("fuel_photo_url", sa.String(length=500), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["transport_id"], ["transports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["attendance_employees.id"]),
        sa.ForeignKeyConstraint(["logistics_id"], ["logistics.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transport_checkins_id"), "transport_checkins", ["id"], unique=False)
    op.create_index(op.f("ix_transport_checkins_transport_id"), "transport_checkins", ["transport_id"], unique=False)
    op.create_index(op.f("ix_transport_checkins_employee_id"), "transport_checkins", ["employee_id"], unique=False)
    op.create_index(op.f("ix_transport_checkins_logistics_id"), "transport_checkins", ["logistics_id"], unique=False)
    op.create_index(op.f("ix_transport_checkins_kind"), "transport_checkins", ["kind"], unique=False)
    op.create_index(op.f("ix_transport_checkins_created_at"), "transport_checkins", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_transport_checkins_created_at"), table_name="transport_checkins")
    op.drop_index(op.f("ix_transport_checkins_kind"), table_name="transport_checkins")
    op.drop_index(op.f("ix_transport_checkins_logistics_id"), table_name="transport_checkins")
    op.drop_index(op.f("ix_transport_checkins_employee_id"), table_name="transport_checkins")
    op.drop_index(op.f("ix_transport_checkins_transport_id"), table_name="transport_checkins")
    op.drop_index(op.f("ix_transport_checkins_id"), table_name="transport_checkins")
    op.drop_table("transport_checkins")
    sa.Enum(name="transportcheckinkind").drop(op.get_bind(), checkfirst=True)

    op.drop_column("notifications", "link_path")

    op.drop_index(op.f("ix_attendance_employees_telegram_pairing_code"), table_name="attendance_employees")
    op.drop_index(op.f("ix_attendance_employees_telegram_chat_id"), table_name="attendance_employees")
    op.drop_column("attendance_employees", "telegram_pairing_code_expires_at")
    op.drop_column("attendance_employees", "telegram_pairing_code")
    op.drop_column("attendance_employees", "telegram_chat_id")
