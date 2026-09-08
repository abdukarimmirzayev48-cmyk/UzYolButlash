"""Transportga SMN obyekt raqami

Revision ID: 20260909_0063
Revises: 20260907_0062
Create Date: 2026-09-09

Monitoring tizimidagi mashina bilan bog'lanish. Davlat raqami bo'yicha
solishtirish ishonchsiz: SMNda 83 ta mashina bor va raqam har xil yozilishi
mumkin, shuning uchun bog'lanish bir marta aniq ko'rsatiladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260909_0063"
down_revision = "20260907_0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("transports") as batch:
        batch.add_column(sa.Column("smn_object_id", sa.Integer(), nullable=True))
    op.create_index("ix_transports_smn_object_id", "transports", ["smn_object_id"])


def downgrade() -> None:
    op.drop_index("ix_transports_smn_object_id", table_name="transports")
    with op.batch_alter_table("transports") as batch:
        batch.drop_column("smn_object_id")
