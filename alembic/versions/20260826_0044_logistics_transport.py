"""Reysni mashinaga bog'lash va reys vaqt nuqtalari

Revision ID: 20260826_0044
Revises: 20260826_0043
Create Date: 2026-08-26
"""

import sqlalchemy as sa
from alembic import op

revision = "20260826_0044"
down_revision = "20260826_0043"
branch_labels = None
depends_on = None


TIMELINE_COLUMNS = [
    "departed_at",
    "loading_started_at",
    "loading_finished_at",
    "arrived_at",
    "unloading_started_at",
    "unloading_finished_at",
    "returned_at",
]


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("transport_id", sa.Integer(), nullable=True))
        for name in TIMELINE_COLUMNS:
            batch.add_column(sa.Column(name, sa.DateTime(), nullable=True))
    op.create_index("ix_logistics_transport_id", "logistics", ["transport_id"])

    # Mavjud reyslarni bog'laymiz. Taxmin qilinmaydi: noaniq qolganlari
    # bo'sh qoladi va ular interfeysda «mashina biriktirilmagan» bo'lib
    # ko'rinadi -- operator ularni bittalab to'g'rilaydi.
    from backend.app.services.transport_matching import match_logistics

    bind = op.get_bind()
    transports = [
        dict(row._mapping)
        for row in bind.execute(sa.text("SELECT id, vehicle_number, trailer_number, driver_name FROM transports"))
    ]
    rows = [
        dict(row._mapping)
        for row in bind.execute(sa.text("SELECT id, vehicle_number, trailer_number, driver_name, carrier_id FROM logistics"))
    ]
    report = match_logistics(rows, transports)
    for logistics_id, transport_id in report.linked.items():
        bind.execute(
            sa.text("UPDATE logistics SET transport_id = :transport_id WHERE id = :logistics_id").bindparams(
                transport_id=transport_id, logistics_id=logistics_id
            )
        )
    print(f"  reys -> mashina: {report.by_reason}")


def downgrade() -> None:
    op.drop_index("ix_logistics_transport_id", table_name="logistics")
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("transport_id")
        for name in TIMELINE_COLUMNS:
            batch.drop_column(name)
