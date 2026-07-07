"""link contract items to product catalog

Revision ID: 20260701_0012
Revises: 20260701_0011
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260701_0012"
down_revision = "20260701_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contract_items", sa.Column("product_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_contract_items_product_id"), "contract_items", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_contract_items_product_id"), table_name="contract_items")
    op.drop_column("contract_items", "product_id")
