"""Manba ikki turga qisqardi, zaxira alohida belgiga chiqdi

Revision ID: 20260909_0066
Revises: 20260909_0065
Create Date: 2026-09-09

Manba oltita tur edi va ular ishlamasdi: «Jarqo'rg'on» deb belgilangan
buyurtmalar Buxoro va Farg'onadan yuklanardi, «Sherobod» birorta
buyurtmada ishlatilmagan, «Boshqa» esa hech qanday qoidaga tushmasdi.
Qaysi bazadan yuklanganini endi yuklash nuqtasi aniq aytadi.

«Ta'minotchi omboridagi zaxira» ham manba emas edi: molni mahalliy
ta'minotchidan olib zaxiraga qo'yamiz, ya'ni manba baribir mahalliy.
Shuning uchun u `orders.from_stock` belgisiga ko'chiriladi -- va endi
import qilingan mol ham zaxiraga tushishi mumkin.

Downgrade eski turlarni tiklamaydi: ular birlashtirildi, qaysi qator
qaysi turdan kelganini ayta oladigan ma'lumot qolmagan. Faqat ustun va
zaxira belgisining o'zi qaytariladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0066"
down_revision = "20260909_0065"
branch_labels = None
depends_on = None

# Eski tur -> yangi tur
COLLAPSE = {
    "jarkurgan": "uzbekistan_local",
    "sherobod": "uzbekistan_local",
    "other": "uzbekistan_local",
    "supplier_held_stock": "uzbekistan_local",
}


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("from_stock", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_orders_from_stock", "orders", ["from_stock"])

    connection = op.get_bind()
    # Zaxira belgisi manba turidan ko'chiriladi -- turlar birlashtirilishidan
    # oldin, aks holda kim zaxiradan kelganini bilib bo'lmaydi.
    connection.execute(sa.text(
        "UPDATE orders SET from_stock = 1 WHERE source_type = 'supplier_held_stock'"
    ))
    for old_value, new_value in COLLAPSE.items():
        connection.execute(
            sa.text("UPDATE orders SET source_type = :new WHERE source_type = :old"),
            {"new": new_value, "old": old_value},
        )
        connection.execute(
            sa.text("UPDATE delivery_batches SET source_type = :new WHERE source_type = :old"),
            {"new": new_value, "old": old_value},
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text(
        "UPDATE orders SET source_type = 'supplier_held_stock' WHERE from_stock = 1"
    ))
    op.drop_index("ix_orders_from_stock", table_name="orders")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("from_stock")
