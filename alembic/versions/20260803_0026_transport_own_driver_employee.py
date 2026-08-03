"""transport: own fleet only, driver linked to employee

Revision ID: 20260803_0026
Revises: 20260803_0025
Create Date: 2026-08-03

All transports are now the company's own fleet (no more hired
third-party carriers tracked here), so `carrier_name`/`is_own` are
dropped. The driver is now linked to a real Employee record via
`driver_employee_id` instead of free-typed text; `driver_name` stays
as a denormalized display column kept in sync from the linked
employee (same pattern as Employee.department/department_id).
"""

from alembic import op
import sqlalchemy as sa


revision = "20260803_0026"
down_revision = "20260803_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_transports_carrier_name"), table_name="transports")
    with op.batch_alter_table("transports") as batch_op:
        batch_op.drop_column("carrier_name")
        batch_op.drop_column("is_own")

    op.add_column("transports", sa.Column("driver_employee_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_transports_driver_employee_id"), "transports", ["driver_employee_id"], unique=False)
    with op.batch_alter_table("transports") as batch_op:
        batch_op.create_foreign_key("fk_transports_driver_employee_id", "attendance_employees", ["driver_employee_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("transports") as batch_op:
        batch_op.drop_constraint("fk_transports_driver_employee_id", type_="foreignkey")
    op.drop_index(op.f("ix_transports_driver_employee_id"), table_name="transports")
    op.drop_column("transports", "driver_employee_id")

    with op.batch_alter_table("transports") as batch_op:
        batch_op.add_column(sa.Column("is_own", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("carrier_name", sa.String(length=255), nullable=False, server_default=""))
    op.create_index(op.f("ix_transports_carrier_name"), "transports", ["carrier_name"], unique=False)
