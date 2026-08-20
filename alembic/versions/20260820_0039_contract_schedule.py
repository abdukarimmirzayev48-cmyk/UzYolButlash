"""Month-by-month delivery plan for contracts

Revision ID: 20260820_0039
Revises: 20260819_0038
Create Date: 2026-08-20

The talabnoma carries a delivery schedule; the contract it becomes did not, so
there was nothing to measure deliveries against once the contract existed.

Nothing is copied here: no contract on file has a customer_request_id, so there
is no schedule to bring across. Contracts created from a talabnoma from now on
inherit its schedule; existing contracts get theirs entered on the card.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260820_0039"
down_revision = "20260819_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contract_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("contract_id", sa.Integer(), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("contract_id", "year", "month", name="uq_contract_schedule_period"),
    )
    op.create_index("ix_contract_schedules_contract_id", "contract_schedules", ["contract_id"])


def downgrade() -> None:
    op.drop_index("ix_contract_schedules_contract_id", table_name="contract_schedules")
    op.drop_table("contract_schedules")
