"""transports module

Revision ID: 20260629_0010
Revises: 20260629_0009
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260629_0010"
down_revision = "20260629_0009"
branch_labels = None
depends_on = None


transport_status = sa.Enum("active", "inactive", "maintenance", name="transportstatus")


def upgrade() -> None:
    transport_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "transports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("carrier_name", sa.String(length=255), nullable=False),
        sa.Column("driver_name", sa.String(length=255), nullable=True),
        sa.Column("driver_phone", sa.String(length=64), nullable=True),
        sa.Column("vehicle_number", sa.String(length=64), nullable=False),
        sa.Column("trailer_number", sa.String(length=64), nullable=True),
        sa.Column("vehicle_type", sa.String(length=64), nullable=True),
        sa.Column("capacity", sa.String(length=64), nullable=True),
        sa.Column("status", transport_status, nullable=False),
        sa.Column("is_own", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transports_id"), "transports", ["id"], unique=False)
    op.create_index(op.f("ix_transports_carrier_name"), "transports", ["carrier_name"], unique=False)
    op.create_index(op.f("ix_transports_driver_name"), "transports", ["driver_name"], unique=False)
    op.create_index(op.f("ix_transports_driver_phone"), "transports", ["driver_phone"], unique=False)
    op.create_index(op.f("ix_transports_vehicle_number"), "transports", ["vehicle_number"], unique=False)
    op.create_index(op.f("ix_transports_trailer_number"), "transports", ["trailer_number"], unique=False)
    op.create_index(op.f("ix_transports_vehicle_type"), "transports", ["vehicle_type"], unique=False)
    op.create_index(op.f("ix_transports_status"), "transports", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_transports_status"), table_name="transports")
    op.drop_index(op.f("ix_transports_vehicle_type"), table_name="transports")
    op.drop_index(op.f("ix_transports_trailer_number"), table_name="transports")
    op.drop_index(op.f("ix_transports_vehicle_number"), table_name="transports")
    op.drop_index(op.f("ix_transports_driver_phone"), table_name="transports")
    op.drop_index(op.f("ix_transports_driver_name"), table_name="transports")
    op.drop_index(op.f("ix_transports_carrier_name"), table_name="transports")
    op.drop_index(op.f("ix_transports_id"), table_name="transports")
    op.drop_table("transports")
    transport_status.drop(op.get_bind(), checkfirst=True)
