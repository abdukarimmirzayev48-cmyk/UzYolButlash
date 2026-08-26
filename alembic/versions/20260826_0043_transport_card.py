"""Transport kartochkasi: hujjat muddatlari, TO va yoqilg'i normasi

Revision ID: 20260826_0043
Revises: 20260824_0042
Create Date: 2026-08-26
"""

import sqlalchemy as sa
from alembic import op

revision = "20260826_0043"
down_revision = "20260824_0042"
branch_labels = None
depends_on = None


NEW_COLUMNS = [
    ("brand_model", sa.String(128)),
    ("production_year", sa.Integer()),
    ("base_location", sa.String(255)),
    ("capacity_tons", sa.Numeric(10, 3)),
    ("fuel_tank_liters", sa.Numeric(10, 2)),
    ("fuel_norm_loaded", sa.Numeric(6, 2)),
    ("fuel_norm_empty", sa.Numeric(6, 2)),
    ("tracker_id", sa.String(128)),
    ("service_interval_km", sa.Numeric(10, 1)),
    ("last_service_km", sa.Numeric(10, 1)),
    ("last_service_date", sa.Date()),
    ("tech_inspection_until", sa.Date()),
    ("insurance_until", sa.Date()),
    ("adr_until", sa.Date()),
    ("responsible_name", sa.String(255)),
    ("unavailable_reason", sa.String(255)),
]

INDEXED = ["base_location", "tracker_id", "tech_inspection_until", "insurance_until", "adr_until"]

# Holat nomlari o'zgardi: `active` -> `free`, `maintenance` -> `repair`.
# Reysdagi/yuklashdagi holatlar bu yerga yozilmaydi -- ularni logistika
# biladi -- shuning uchun ko'chirish shu ikkitasi bilan cheklanadi.
STATUS_FORWARD = {"active": "free", "maintenance": "repair"}
STATUS_BACKWARD = {"free": "active", "repair": "maintenance", "service": "maintenance", "idle": "active"}


def _move_statuses(mapping: dict[str, str]) -> None:
    for old, new in mapping.items():
        op.execute(sa.text("UPDATE transports SET status = :new WHERE status = :old").bindparams(new=new, old=old))


def upgrade() -> None:
    with op.batch_alter_table("transports") as batch:
        for name, column_type in NEW_COLUMNS:
            batch.add_column(sa.Column(name, column_type, nullable=True))
    for name in INDEXED:
        op.create_index(f"ix_transports_{name}", "transports", [name])
    _move_statuses(STATUS_FORWARD)

    # `capacity` matn maydonida sig'im «27 tonna» ko'rinishida yozilgan.
    # Boshidagi sonni ajratib olamiz -- qo'lda qayta kiritishga hojat
    # qolmasin. Ajratilmaganlari bo'sh qoladi va ular ko'rinib turadi.
    op.execute(
        sa.text(
            """
            UPDATE transports
               SET capacity_tons = CAST(TRIM(SUBSTR(capacity, 1, INSTR(capacity || ' ', ' ') - 1)) AS NUMERIC)
             WHERE capacity IS NOT NULL
               AND TRIM(SUBSTR(capacity, 1, INSTR(capacity || ' ', ' ') - 1)) GLOB '[0-9]*'
            """
        )
    )


def downgrade() -> None:
    _move_statuses(STATUS_BACKWARD)
    for name in INDEXED:
        op.drop_index(f"ix_transports_{name}", table_name="transports")
    with op.batch_alter_table("transports") as batch:
        for name, _ in NEW_COLUMNS:
            batch.drop_column(name)
