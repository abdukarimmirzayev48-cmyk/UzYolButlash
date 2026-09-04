"""Talabnomada yetkazish usuli

Revision ID: 20260904_0056
Revises: 20260902_0055
Create Date: 2026-09-04

Usul ilgari faqat mahsulotdan chiqarilardi va hech qayerda saqlanmasdi.
Endi u talabnomada ochiq tanlanadi: mahsulotdan sukut qiymat keladi,
lekin xodim uni o'zgartira oladi -- va aynan shu tanlov yetkazish
nuqtalari ro'yxatini belgilaydi (temiryo'lda stansiyalar, avtoda ABZ).

Mavjud yozuvlar to'ldirilmaydi: ularning nuqtasi allaqachon tanlangan va
usulni nuqta turidan bilib olish mumkin. Taxmin bilan yozib qo'yish esa
yolg'on aniqlik berardi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260904_0056"
down_revision = "20260902_0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("customer_requests") as batch:
        batch.add_column(sa.Column("delivery_method", sa.String(16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("customer_requests") as batch:
        batch.drop_column("delivery_method")
