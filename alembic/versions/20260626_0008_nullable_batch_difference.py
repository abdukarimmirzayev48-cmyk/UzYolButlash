"""allow pending batch quantity acceptance

Revision ID: 20260626_0008
Revises: 20260624_0007
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260626_0008"
down_revision = "20260624_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("delivery_batch_items") as batch_op:
        batch_op.alter_column(
            "difference_quantity",
            existing_type=sa.Numeric(18, 3),
            nullable=True,
            existing_server_default=None,
        )
    op.execute("UPDATE delivery_batch_items SET difference_quantity = NULL WHERE accepted_quantity IS NULL")
    op.execute(
        """
        UPDATE delivery_batches
        SET status = 'accepted'
        WHERE status = 'quantity_difference'
          AND EXISTS (
            SELECT 1 FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = delivery_batches.id
              AND delivery_batch_items.accepted_quantity IS NOT NULL
          )
        """
    )
    op.execute(
        """
        UPDATE delivery_batches
        SET status = 'arrived'
        WHERE status = 'quantity_difference'
          AND NOT EXISTS (
            SELECT 1 FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = delivery_batches.id
              AND delivery_batch_items.accepted_quantity IS NOT NULL
        )
        """
    )
    op.execute(
        """
        UPDATE logistics
        SET status = 'delivered'
        WHERE status = 'accepted'
          AND actual_delivery_date IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM delivery_batch_items
            WHERE delivery_batch_items.delivery_batch_id = logistics.delivery_batch_id
              AND delivery_batch_items.accepted_quantity IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    op.execute("UPDATE delivery_batch_items SET difference_quantity = 0 WHERE difference_quantity IS NULL")
    with op.batch_alter_table("delivery_batch_items") as batch_op:
        batch_op.alter_column(
            "difference_quantity",
            existing_type=sa.Numeric(18, 3),
            nullable=False,
            existing_server_default=None,
        )
