"""Qabul farqi bo'yicha qaror uchun maydonlar

Revision ID: 20260823_0041
Revises: 20260820_0040
Create Date: 2026-08-23

Farq allaqachon hisoblanardi -- `delivery_batch_items.difference_quantity` --
lekin uni yopadigan joy yo'q edi. Partiya yakunlangandan keyin ham qolgan
miqdor buyurtmada «yo'lda, qabul qilinmagan» bo'lib turaverardi, fakturasi esa
to'liq miqdorga qo'yilgan holicha qolardi.

To'rtta maydon: qaror, izoh va uni kim/qachon qabul qilgani. Qaror matn
sifatida saqlanadi -- SQLite'da enum'ni keyin kengaytirish uchun jadvalni
qayta yaratish kerak bo'lardi, ro'yxat esa hali o'sishi mumkin.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260823_0041"
down_revision = "20260820_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_batches") as batch:
        batch.add_column(sa.Column("difference_resolution", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("difference_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("difference_resolved_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("difference_resolved_by", sa.String(length=255), nullable=True))
    op.create_index("ix_delivery_batches_difference_resolution", "delivery_batches", ["difference_resolution"])


def downgrade() -> None:
    op.drop_index("ix_delivery_batches_difference_resolution", table_name="delivery_batches")
    with op.batch_alter_table("delivery_batches") as batch:
        batch.drop_column("difference_resolved_by")
        batch.drop_column("difference_resolved_at")
        batch.drop_column("difference_note")
        batch.drop_column("difference_resolution")
