"""Yetkazish usuli: temiryo'l ham

Revision ID: 20260902_0053
Revises: 20260830_0052
Create Date: 2026-09-02

Partiya va logistikadagi `delivery_method` bitta qiymatli ro'yxat edi --
faqat «auto». Shartnomada esa allaqachon uchtasi bor: auto, railway,
mixed. Ikkita lug'at bo'lgani uchun «shartnomada temiryo'l deyilgan,
partiya avto bilan ketibdi» degan taqqoslashni qilib bo'lmasdi.

Ustun VARCHAR(4) edi -- «auto» ga o'lchab qo'yilgan. SQLite uzunlikni
e'tiborsiz qoldiradi, lekin ta'rif yolg'on bo'lib qolmasin.

Turkumga sukut usuli qo'shiladi. U MAJBURIY emas: partiya yaratilganda
oldindan tanlab qo'yiladi, operator almashtira oladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260902_0053"
down_revision = "20260830_0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("delivery_batches", "logistics"):
        with op.batch_alter_table(table) as batch:
            batch.alter_column("delivery_method", type_=sa.String(16), existing_nullable=False)
    with op.batch_alter_table("product_categories") as batch:
        batch.add_column(sa.Column("default_delivery_method", sa.String(16), nullable=True))
    # Mavjud turkumlar nomi bo'yicha to'ldiriladi. Nomi boshqacha bo'lsa
    # hech narsa qilinmaydi -- maydon bo'sh qoladi va operator o'zi tanlaydi.
    op.execute(sa.text("UPDATE product_categories SET default_delivery_method = 'auto' WHERE name LIKE '%itum%'"))
    op.execute(sa.text("UPDATE product_categories SET default_delivery_method = 'railway' WHERE name LIKE '%uz%' AND name LIKE '%exnik%'"))


def downgrade() -> None:
    with op.batch_alter_table("product_categories") as batch:
        batch.drop_column("default_delivery_method")
    for table in ("delivery_batches", "logistics"):
        with op.batch_alter_table(table) as batch:
            batch.alter_column("delivery_method", type_=sa.String(4), existing_nullable=False)
