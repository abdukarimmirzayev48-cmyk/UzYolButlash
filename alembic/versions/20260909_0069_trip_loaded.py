"""Reysning yuklangan miqdori

Revision ID: 20260909_0069
Revises: 20260909_0068
Create Date: 2026-09-09

Yuklangan miqdor partiya bandlariga to'g'ridan-to'g'ri yozilardi. Bitta
partiyada bir nechta reys bo'lgach, ikkinchi reysning yuklashi
birinchisining raqamini bosib ketadi. Endi har bir reys o'z yuklaganini
saqlaydi, partiya bandlari esa ularning yig'indisidan hisoblanadi.

Mavjud reyslarga partiya bandlaridagi yig'indi yoziladi: ular butun
partiyani tashigan.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0069"
down_revision = "20260909_0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("loaded_quantity", sa.Numeric(18, 3), nullable=True))
    op.get_bind().execute(sa.text(
        """
        UPDATE logistics SET loaded_quantity = (
            SELECT SUM(loaded_quantity) FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = logistics.delivery_batch_id
        )
        WHERE loaded_quantity IS NULL
        """
    ))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("loaded_quantity")
