"""Xarid bo'limi olib tashlandi

Revision ID: 20260906_0060
Revises: 20260906_0059
Create Date: 2026-09-06

Mol birja ticketidan zaxiraga tushadi va buyurtma o'sha yerdan bajariladi;
hisob-faktura esa to'g'ridan-to'g'ri buyurtmaga bog'lanadi. Xarid yozuvi
ikkalasining orasida ortiqcha bo'g'in bo'lib qolgan edi -- har buyurtmaga
o'z-o'zidan ochilib, bo'sh qoralama bo'lib turardi. Ta'minotchi takliflari
esa buyurtma kartochkasida o'z mexanizmi bilan yuritiladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260906_0060"
down_revision = "20260906_0059"
branch_labels = None
depends_on = None

DROPPED_COLUMNS = [
    ("supplier_invoices", "procurement_id"),
    ("supplier_invoices", "supplier_offer_id"),
    ("supplier_invoice_items", "procurement_item_id"),
    ("supplier_invoice_items", "supplier_offer_item_id"),
    ("supplier_finance_documents", "procurement_id"),
    ("supplier_finance_notes", "procurement_id"),
]

DROPPED_TABLES = [
    "procurement_notes",
    "procurement_documents",
    "supplier_offer_items",
    "supplier_offers",
    "procurement_items",
    "procurements",
]


def upgrade() -> None:
    # Indeks avval olib tashlanadi: SQLite ustunni ko'chirib qayta yaratganda
    # eski indeksni ham tiklashga urinadi va yo'q ustunga tayanib yiqiladi.
    bind = op.get_bind()
    existing = {row[0] for row in bind.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='index'")}
    for table, column in DROPPED_COLUMNS:
        index_name = f"ix_{table}_{column}"
        if index_name in existing:
            op.drop_index(index_name, table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
    for table in DROPPED_TABLES:
        op.drop_table(table)


def downgrade() -> None:
    raise NotImplementedError(
        "Xarid bo'limi qaytarilmaydi: jadvallar va ulardagi ma'lumot butunlay olib tashlandi."
    )
