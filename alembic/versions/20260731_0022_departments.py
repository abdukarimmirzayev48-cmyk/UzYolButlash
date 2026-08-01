"""departments

Revision ID: 20260731_0022
Revises: 20260727_0021
Create Date: 2026-07-31
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20260731_0022"
down_revision = "20260727_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_departments_id"), "departments", ["id"], unique=False)
    op.create_index(op.f("ix_departments_name"), "departments", ["name"], unique=False)

    op.add_column("attendance_employees", sa.Column("department_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_attendance_employees_department_id"), "attendance_employees", ["department_id"], unique=False)
    with op.batch_alter_table("attendance_employees") as batch_op:
        batch_op.create_foreign_key("fk_attendance_employees_department_id", "departments", ["department_id"], ["id"])

    # Backfill: turn each distinct existing free-text department value into a real
    # Department row, then point employees at it — no manual re-entry needed.
    bind = op.get_bind()
    distinct_departments = bind.execute(
        sa.text("SELECT DISTINCT department FROM attendance_employees WHERE department IS NOT NULL AND department != ''")
    ).fetchall()
    now = datetime.utcnow()
    for (name,) in distinct_departments:
        bind.execute(sa.text("INSERT INTO departments (name, is_active, created_at, updated_at) VALUES (:name, 1, :now, :now)"), {"name": name, "now": now})
    bind.execute(
        sa.text(
            "UPDATE attendance_employees SET department_id = ("
            "SELECT id FROM departments WHERE departments.name = attendance_employees.department"
            ") WHERE department IS NOT NULL AND department != ''"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("attendance_employees") as batch_op:
        batch_op.drop_constraint("fk_attendance_employees_department_id", type_="foreignkey")
    op.drop_index(op.f("ix_attendance_employees_department_id"), table_name="attendance_employees")
    op.drop_column("attendance_employees", "department_id")
    op.drop_index(op.f("ix_departments_name"), table_name="departments")
    op.drop_index(op.f("ix_departments_id"), table_name="departments")
    op.drop_table("departments")
