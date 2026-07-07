"""attendance module

Revision ID: 20260706_0016
Revises: 20260705_0015
Create Date: 2026-07-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_0016"
down_revision = "20260705_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_employees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("badge_number", sa.String(length=64), nullable=True),
        sa.Column("scheduled_check_in", sa.Time(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("badge_number"),
    )
    op.create_index(op.f("ix_attendance_employees_id"), "attendance_employees", ["id"], unique=False)
    op.create_index(op.f("ix_attendance_employees_full_name"), "attendance_employees", ["full_name"], unique=False)
    op.create_index(op.f("ix_attendance_employees_department"), "attendance_employees", ["department"], unique=False)
    op.create_index(op.f("ix_attendance_employees_badge_number"), "attendance_employees", ["badge_number"], unique=False)

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("check_in_time", sa.Time(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("on_time", "late", "absent", "day_off", "no_data", name="attendancestatus"),
            nullable=False,
        ),
        sa.Column("late_minutes", sa.Integer(), nullable=False),
        sa.Column("early_leave", sa.Boolean(), nullable=False),
        sa.Column("disciplinary_violation", sa.Boolean(), nullable=False),
        sa.Column("absence_hours", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["attendance_employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_date"),
    )
    op.create_index(op.f("ix_attendance_records_employee_id"), "attendance_records", ["employee_id"], unique=False)
    op.create_index(op.f("ix_attendance_records_work_date"), "attendance_records", ["work_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_attendance_records_work_date"), table_name="attendance_records")
    op.drop_index(op.f("ix_attendance_records_employee_id"), table_name="attendance_records")
    op.drop_table("attendance_records")
    op.drop_index(op.f("ix_attendance_employees_badge_number"), table_name="attendance_employees")
    op.drop_index(op.f("ix_attendance_employees_department"), table_name="attendance_employees")
    op.drop_index(op.f("ix_attendance_employees_full_name"), table_name="attendance_employees")
    op.drop_index(op.f("ix_attendance_employees_id"), table_name="attendance_employees")
    op.drop_table("attendance_employees")
    sa.Enum(name="attendancestatus").drop(op.get_bind(), checkfirst=True)
