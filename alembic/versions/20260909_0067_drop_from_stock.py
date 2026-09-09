"""Zaxira belgisi olib tashlandi -- mol har doim zaxiradan olinadi

Revision ID: 20260909_0067
Revises: 20260909_0066
Create Date: 2026-09-09

`from_stock` belgisi bir necha soat yashadi. U manba turidan ajratib
olingan edi, lekin amalda hech qachon «yo'q» bo'lmaydi: zaxira moddiy
narsa emas, u birja ticketi bilan ishlaydi, va mol Rossiyadan kelsa ham,
mahalliy bo'lsa ham baribir ticket orqali zaxiraga tushadi. Xaridlar
bo'limi esa butunlay o'chirilgan, ya'ni boshqa yo'l qolmagan.

Har doim rost bo'ladigan belgi hech narsani ayirmaydi. Buyurtma zaxiradan
olinganini endi zaxira ajratmasining o'zi aytadi -- fakt, belgi emas.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0067"
down_revision = "20260909_0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_orders_from_stock", table_name="orders")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("from_stock")


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("from_stock", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_orders_from_stock", "orders", ["from_stock"])
    # Ajratmasi bor buyurtma zaxiradan olingan -- belgini shundan tiklaymiz.
    op.get_bind().execute(sa.text(
        "UPDATE orders SET from_stock = 1 WHERE id IN (SELECT DISTINCT order_id FROM stock_allocations WHERE order_id IS NOT NULL)"
    ))
