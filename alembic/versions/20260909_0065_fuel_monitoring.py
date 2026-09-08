"""Yoqilg'i monitoringi: datchik namunalari va haydovchi hisobotiga taqqoslash

Revision ID: 20260909_0065
Revises: 20260909_0064
Create Date: 2026-09-09

Ikki narsa qo'shiladi:

1. `transport_fuel_samples` -- datchik ko'rsatkichlari tarixi. SMN marshrut
   javobida yoqilg'i qatori yo'q, faqat hozirgi ko'rsatkich bor; reys
   yopilganda «boshida qancha edi» degan savolga javob faqat o'sha payt
   yozib qo'yilgan bo'lsa topiladi.

2. `transport_checkins` va `logistics` ga datchik ustunlari -- haydovchi aytgan raqamning
   yonida monitoring raqami tursin. Ilgari haydovchi aytgan yoqilg'ini
   haydovchi aytgan yoqilg'i bilan solishtirardik.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0065"
down_revision = "20260909_0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transport_fuel_samples",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transport_id", sa.Integer(), sa.ForeignKey("transports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.Column("fuel_liters", sa.Numeric(10, 2), nullable=True),
        sa.Column("lat", sa.Numeric(10, 7), nullable=True),
        sa.Column("lng", sa.Numeric(10, 7), nullable=True),
        sa.Column("speed", sa.Numeric(6, 1), nullable=True),
        sa.Column("engine_on", sa.Boolean(), nullable=True),
        sa.Column("moving", sa.Boolean(), nullable=True),
        sa.Column("online", sa.Boolean(), nullable=True),
    )
    op.create_index("ix_transport_fuel_samples_transport_id", "transport_fuel_samples", ["transport_id"])
    op.create_index("ix_transport_fuel_samples_captured_at", "transport_fuel_samples", ["captured_at"])

    with op.batch_alter_table("transport_checkins") as batch:
        batch.add_column(sa.Column("sensor_fuel_liters", sa.Numeric(10, 2), nullable=True))
        batch.add_column(sa.Column("sensor_distance_km", sa.Numeric(10, 2), nullable=True))
        batch.add_column(sa.Column("sensor_distance_checked_at", sa.DateTime(), nullable=True))

    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("sensor_fuel_before_liters", sa.Numeric(10, 2), nullable=True))
        batch.add_column(sa.Column("sensor_fuel_after_liters", sa.Numeric(10, 2), nullable=True))
        batch.add_column(sa.Column("sensor_fuel_drop_liters", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("sensor_fuel_drop_liters")
        batch.drop_column("sensor_fuel_after_liters")
        batch.drop_column("sensor_fuel_before_liters")

    with op.batch_alter_table("transport_checkins") as batch:
        batch.drop_column("sensor_distance_checked_at")
        batch.drop_column("sensor_distance_km")
        batch.drop_column("sensor_fuel_liters")

    op.drop_index("ix_transport_fuel_samples_captured_at", table_name="transport_fuel_samples")
    op.drop_index("ix_transport_fuel_samples_transport_id", table_name="transport_fuel_samples")
    op.drop_table("transport_fuel_samples")
