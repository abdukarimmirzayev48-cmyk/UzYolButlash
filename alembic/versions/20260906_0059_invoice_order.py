"""Ta'minotchi hisobi buyurtmaga bog'lanadi

Revision ID: 20260906_0059
Revises: 20260905_0058
Create Date: 2026-09-06

Hisob ilgari xarid orqali buyurtmaga ulanardi. Xarid endi avtomatik
ochilmagani uchun bu bo'g'in uzilib qoladi: hisob bor, buyurtma bor, lekin
orasida bog' yo'q va tannarx hisobga kirmaydi. Endi bog' to'g'ridan-to'g'ri.
Mavjud hisoblar xaridi orqali buyurtmaga ko'chiriladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260906_0059"
down_revision = "20260905_0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("supplier_invoices") as batch:
        batch.add_column(sa.Column("order_id", sa.Integer(), nullable=True))
    op.create_index("ix_supplier_invoices_order_id", "supplier_invoices", ["order_id"])
    op.execute(
        """
        UPDATE supplier_invoices
           SET order_id = (
                 SELECT p.order_id FROM procurements p
                  WHERE p.id = supplier_invoices.procurement_id
               )
         WHERE procurement_id IS NOT NULL AND order_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_invoices_order_id", table_name="supplier_invoices")
    with op.batch_alter_table("supplier_invoices") as batch:
        batch.drop_column("order_id")
