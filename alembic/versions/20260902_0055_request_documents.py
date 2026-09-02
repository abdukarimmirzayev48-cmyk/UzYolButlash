"""Talabnoma: muzokara holati birlashtirildi, hujjatlar qo'shildi

Revision ID: 20260902_0055
Revises: 20260902_0054
Create Date: 2026-09-02

«Muzokara» alohida holat edi. Amalda ko'rib chiqish va muzokara bir vaqtda
ketadi -- operator qaysi biridaligini ajrata olmasdi. Mavjud yozuvlar va
status tarixi «ko'rib chiqilmoqda» ga o'tkaziladi: tarixni o'chirib
tashlash noto'g'ri bo'lardi, chunki o'sha o'tishlar haqiqatan bo'lgan.

Hujjatlar jadvali: shartnoma aynan mijozning xati asosida tayyorlanadi va
u talabnomaga biriktirilishi kerak. Ilgari xat pochtada yoki papkada
qolib ketardi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260902_0055"
down_revision = "20260902_0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE customer_requests SET status = 'reviewing' WHERE status = 'negotiation'"))
    op.execute(sa.text("UPDATE customer_request_status_history SET new_status = 'reviewing' WHERE new_status = 'negotiation'"))
    op.execute(sa.text("UPDATE customer_request_status_history SET old_status = 'reviewing' WHERE old_status = 'negotiation'"))
    # Birlashtirishdan keyin «ko'rib chiqilmoqda -> ko'rib chiqilmoqda» degan
    # ma'nosiz qatorlar qoladi: ular endi hech qanday o'zgarishni bildirmaydi.
    op.execute(sa.text("DELETE FROM customer_request_status_history WHERE old_status = new_status"))

    op.create_table(
        "customer_request_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("customer_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_customer_request_documents_request_id", "customer_request_documents", ["request_id"])
    op.create_index("ix_customer_request_documents_type", "customer_request_documents", ["document_type"])


def downgrade() -> None:
    op.drop_index("ix_customer_request_documents_type", table_name="customer_request_documents")
    op.drop_index("ix_customer_request_documents_request_id", table_name="customer_request_documents")
    op.drop_table("customer_request_documents")
    # «Muzokara» qaytarilmaydi: qaysi yozuv ilgari muzokarada bo'lganini
    # bilishning imkoni yo'q, taxmin qilish esa tarixni buzadi.
