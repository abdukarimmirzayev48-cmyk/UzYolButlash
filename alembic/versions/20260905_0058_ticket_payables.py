"""Birja ticketi kreditorlikka ulanadi

Revision ID: 20260905_0058
Revises: 20260904_0057
Create Date: 2026-09-05

Ticketda to'lov sharti bor (forward, 90 kun), lekin u hisob-fakturaga
bog'lanmasdi va Kreditorlik faqat hisob-fakturalarni sanardi. Natijada
ochiq ticketlar bo'yicha ~25 mlrd so'mlik majburiyat hisobotdan
tashqarida qolgan edi.

Endi hisob-faktura ticketga bog'lanadi: ticket bo'yicha hisob kelguncha
qarzni ticketning o'zi ko'rsatib turadi, hisob yaratilgach esa qarz
hisobga o'tadi va ikki marta sanalmaydi.

`procurement_id` endi majburiy emas: ticket orqali sotib olingan molning
xaridi yo'q, hisob-fakturasi esa bo'lishi kerak. Ilgari bunday hisobni
umuman yaratib bo'lmasdi.

FK ustun sifatida oddiy Integer qo'shiladi -- SQLite batch_alter_table
nomsiz FK constraintni ko'tarmaydi; bog'lanish modelda e'lon qilingan.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260905_0058"
down_revision = "20260904_0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("supplier_invoices") as batch:
        batch.add_column(sa.Column("ticket_id", sa.Integer(), nullable=True))
        batch.alter_column("procurement_id", existing_type=sa.Integer(), nullable=True)
    op.create_index("ix_supplier_invoices_ticket_id", "supplier_invoices", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_supplier_invoices_ticket_id", table_name="supplier_invoices")
    # procurement_id ni NOT NULL ga qaytarishdan oldin bo'shlari to'ldirilishi
    # kerak edi -- bunday xarid yo'q, shuning uchun ustun nullable qoladi.
    with op.batch_alter_table("supplier_invoices") as batch:
        batch.drop_column("ticket_id")
