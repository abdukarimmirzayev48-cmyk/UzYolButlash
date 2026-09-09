"""Bitta partiyada bir nechta reys

Revision ID: 20260909_0068
Revises: 20260909_0067
Create Date: 2026-09-09

100 tonnalik partiya bitta sisternaga sig'maydi -- eng katta mashina 22
tonna oladi. Tizim esa partiyaga aynan bitta reys bog'lardi
(`logistics.delivery_batch_id` yagona edi). Natijada bitta reysning
odometri, bak qoldig'i va tarozisi butun partiyaga yozilar va reys
nazorati ma'nosini yo'qotardi.

Endi partiyada bir nechta reys bo'ladi. Har birining o'z mashinasi, o'z
miqdori, o'z probegi va yoqilg'i hisobi bor.

SQLite'da yagona cheklov ustunning o'zida turadi, shuning uchun jadval
qayta quriladi -- `batch_alter_table` shuni qiladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0068"
down_revision = "20260909_0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.add_column(sa.Column("planned_quantity", sa.Numeric(18, 3), nullable=True))

    # Yagona cheklov ustun ta'rifining o'zida turadi va SQLite'da uning
    # nomi yo'q (`sqlite_autoindex_...`), shuning uchun uni nomi bilan
    # o'chirib bo'lmaydi. Jadvalni aks ettirib olamiz, cheklovni
    # ro'yxatdan chiqaramiz va jadvalni shu ta'rif bo'yicha qayta
    # quramiz -- alembic `copy_from` aynan shu uchun.
    connection = op.get_bind()
    table = sa.Table("logistics", sa.MetaData(), autoload_with=connection)
    table.constraints = {
        constraint for constraint in table.constraints
        if not (
            isinstance(constraint, sa.UniqueConstraint)
            and [column.name for column in constraint.columns] == ["delivery_batch_id"]
        )
    }
    table.columns["delivery_batch_id"].unique = False
    with op.batch_alter_table("logistics", copy_from=table, recreate="always"):
        pass

    # Mavjud reyslar butun partiyani tashigan -- ularning miqdori partiya
    # miqdoriga teng. Bo'sh qoldirilsa, «reysga biriktirilmagan miqdor»
    # butun partiyani ko'rsatib turardi.
    connection.execute(sa.text(
        """
        UPDATE logistics SET planned_quantity = (
            SELECT SUM(planned_quantity) FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = logistics.delivery_batch_id
        )
        WHERE planned_quantity IS NULL
        """
    ))


def downgrade() -> None:
    with op.batch_alter_table("logistics") as batch:
        batch.drop_column("planned_quantity")
