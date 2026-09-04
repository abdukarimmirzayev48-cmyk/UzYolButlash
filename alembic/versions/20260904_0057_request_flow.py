"""Talabnoma «shartnoma tayyorlanmoqda» da tugaydi

Revision ID: 20260904_0057
Revises: 20260904_0056
Create Date: 2026-09-04

«Shartnoma imzolandi» va «buyurtmaga o'tkazildi» talabnomaning emas,
shartnomaning hayoti edi -- bitta narsa ikki joyda yuritilardi. Ikkinchisi
umuman ishlamasdi ham: «buyurtmaga o'tkazish» endpointi hech narsa
yaratmasdi, faqat xabar qaytarardi.

Imzolangan talabnoma «shartnoma tayyorlanmoqda» ga qaytariladi: shartnoma
imzolangani endi shartnomaning o'zida yuritiladi va talabnoma o'sha
yerda tugagan holicha qoladi.

Tarix o'chirilmaydi -- o'sha o'tishlar haqiqatan bo'lgan. Faqat holat
nomi bugungi ro'yxatga keltiriladi, aks holda kartochka o'qilmay qolardi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260904_0057"
down_revision = "20260904_0056"
branch_labels = None
depends_on = None

GONE = ("contract_signed", "converted_to_order")


def upgrade() -> None:
    for old in GONE:
        op.execute(sa.text(f"UPDATE customer_requests SET status = 'contract_preparation' WHERE status = '{old}'"))
        op.execute(sa.text(f"UPDATE customer_request_status_history SET new_status = 'contract_preparation' WHERE new_status = '{old}'"))
        op.execute(sa.text(f"UPDATE customer_request_status_history SET old_status = 'contract_preparation' WHERE old_status = '{old}'"))
    # Birlashtirishdan keyin qolgan «bir xil holatdan bir xil holatga»
    # degan qatorlar endi hech qanday o'zgarishni bildirmaydi.
    op.execute(sa.text("DELETE FROM customer_request_status_history WHERE old_status = new_status"))


def downgrade() -> None:
    # Qaytarilmaydi: qaysi yozuv ilgari imzolangan bo'lganini bilishning
    # imkoni yo'q, taxmin qilish esa tarixni buzadi.
    pass
