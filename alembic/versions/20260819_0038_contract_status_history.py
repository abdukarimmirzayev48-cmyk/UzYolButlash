"""Status history for contracts

Revision ID: 20260819_0038
Revises: 20260819_0037
Create Date: 2026-08-19

A contract's status could only be changed through the dropdown on the full edit
form, which left no record of who changed it, when, or why. The talabnoma module
already keeps that trail; contracts are legal documents and had none.

Existing contracts get one opening entry each, recording the status they are in
now with no author -- because there genuinely is none to record. Inventing one
would be worse than an honest gap.
"""

from alembic import op
import sqlalchemy as sa

from backend.app.services.contract_workflow import MSG_HISTORY_BASELINE

revision = "20260819_0038"
down_revision = "20260819_0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contract_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("contract_id", sa.Integer(), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_status", sa.String(length=32), nullable=True),
        sa.Column("new_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by", sa.String(length=255), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_contract_status_history_contract_id", "contract_status_history", ["contract_id"])
    op.create_index("ix_contract_status_history_new_status", "contract_status_history", ["new_status"])
    op.create_index("ix_contract_status_history_created_at", "contract_status_history", ["created_at"])

    # One opening entry per contract, so the history is never empty and the
    # first real change has something to follow.
    op.execute(
        sa.text(
            "INSERT INTO contract_status_history "
            "(contract_id, old_status, new_status, changed_by, comment, created_at) "
            "SELECT id, NULL, status, created_by, :note, created_at FROM contracts"
        ).bindparams(note=MSG_HISTORY_BASELINE)
    )


def downgrade() -> None:
    op.drop_index("ix_contract_status_history_created_at", table_name="contract_status_history")
    op.drop_index("ix_contract_status_history_new_status", table_name="contract_status_history")
    op.drop_index("ix_contract_status_history_contract_id", table_name="contract_status_history")
    op.drop_table("contract_status_history")
