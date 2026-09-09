"""Reysning qabul qilingan miqdori

Revision ID: 20260909_0070
Revises: 20260909_0069
Create Date: 2026-09-09

Qabul partiya bandlariga yozilardi -- ya'ni mahsulot bo'yicha, mashina
bo'yicha emas. Har bir mashina esa alohida qabul qilinadi va kamomad ham
reys bo'yicha chiqadi: qaysi mashinada yo'qolgani ma'lum bo'lsa,
javobgar ham ma'lum bo'ladi.

Mavjud reyslarga partiya bandlaridagi yig'indi yoziladi: ular butun
partiyani tashigan.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0070"
down_revision = "20260909_0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("accepted_quantity", sa.Numeric(18, 3), nullable=True))
    op.get_bind().execute(sa.text(
        """
        UPDATE logistics SET accepted_quantity = (
            SELECT SUM(accepted_quantity) FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = logistics.delivery_batch_id
        )
        WHERE accepted_quantity IS NULL
        """
    ))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("accepted_quantity")
