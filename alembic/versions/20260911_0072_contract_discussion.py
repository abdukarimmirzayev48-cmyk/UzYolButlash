"""Shartnomada «Muhokamada» holati

Revision ID: 20260911_0072
Revises: 20260910_0071
Create Date: 2026-09-11

Mijoz shartnomani Uzex orqali namunaga muvofiq qaytaradi, biz uni
tasdiqlaymiz va bir-ikki kun muhokama qilinadi -- shundan keyin
imzolanadi. Bu oraliq ekranda umuman ko'rinmasdi: qaytib kelgan
shartnoma imzolanguncha «loyiha» bo'lib turardi.

Ustun `VARCHAR(9)` edi -- eng uzun holat nomi «cancelled» bo'lgani
uchun. Yangi `under_discussion` 16 belgi, shuning uchun ustun
kengaytiriladi. SQLite uzunlikni tekshirmaydi, lekin sxema haqiqatni
aytishi kerak.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260911_0072"
down_revision = "20260910_0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("contracts") as batch:
        batch.alter_column("status", existing_type=sa.String(9), type_=sa.String(32), existing_nullable=False)


def downgrade() -> None:
    # Yangi holatdagi shartnomalar qaytishda «loyiha» ga tushadi: eski
    # ustunda ular uchun nom yo'q.
    op.execute("UPDATE contracts SET status = 'draft' WHERE status = 'under_discussion'")
    op.execute("UPDATE contract_status_history SET new_status = 'draft' WHERE new_status = 'under_discussion'")
    op.execute("UPDATE contract_status_history SET old_status = 'draft' WHERE old_status = 'under_discussion'")
    with op.batch_alter_table("contracts") as batch:
        batch.alter_column("status", existing_type=sa.String(32), type_=sa.String(9), existing_nullable=False)
