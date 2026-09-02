"""Temiryo'l stansiyasi -- yetkazish nuqtasining turi

Revision ID: 20260902_0054
Revises: 20260902_0053
Create Date: 2026-09-02

Texnik tuz vagonlarda stansiyaga keladi. Stansiya uchun alohida
ma'lumotnoma ochilmadi: uning ham viloyati, tumani, manzili,
koordinatasi va mas'ul shaxsi bor -- ABZ bilan aynan bir xil kartochka.
Alohida jadval bo'lsa, ro'yxat, panel, xarita, qidiruv va eksportni
ikkinchi marta yozishga to'g'ri kelardi.

Yagona farqi -- stansiya kodi. Temiryo'l nakladnoyida stansiya aynan
kod bilan yoziladi («739401 - Болдыр»), nomi bo'yicha izlash esa
ishonchsiz: bir xil nomli stansiyalar bor.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260902_0054"
down_revision = "20260902_0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_points") as batch:
        batch.add_column(sa.Column("station_code", sa.String(16), nullable=True))
    op.create_index("ix_delivery_points_station_code", "delivery_points", ["station_code"])


def downgrade() -> None:
    op.drop_index("ix_delivery_points_station_code", table_name="delivery_points")
    with op.batch_alter_table("delivery_points") as batch:
        batch.drop_column("station_code")
