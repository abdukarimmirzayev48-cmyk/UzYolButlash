"""Kunlik provodka

Revision ID: 20260910_0071
Revises: 20260909_0070
Create Date: 2026-09-10

Tizimda pul faqat hisob-faktura orqali ko'rinardi. Ish haqi, soliq,
yoqilg'i, bank komissiyasi -- kundalik xarajatlarning katta qismi hech
qayerda yozilmasdi, ya'ni «bugun qancha kirdi va qayerga ketdi» degan
savolga javob yo'q edi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260910_0071"
down_revision = "20260909_0070"
branch_labels = None
depends_on = None

DIRECTIONS = ("incoming", "outgoing")
STATUSES = ("draft", "closed")
CATEGORIES = (
    "customer_payment", "advance", "loan_in", "other_income",
    "supplier_payment", "salary", "tax", "fuel", "transport", "repair",
    "utilities", "bank_fee", "loan_out", "other_expense",
)


def upgrade() -> None:
    op.create_table(
        "daily_ledgers",
        sa.Column("id", sa.Integer(), nullable=False),
        # Bir kunga bitta jurnal: ikkinchisi ochilsa kunlik jami ikkiga
        # bo'linib ketardi va qoldiq zanjiri uzilardi.
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(18, 2), server_default="0", nullable=False),
        sa.Column("status", sa.Enum(*STATUSES, name="ledgerstatus"), server_default="draft", nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_date", name="uq_daily_ledgers_entry_date"),
    )
    op.create_index("ix_daily_ledgers_entry_date", "daily_ledgers", ["entry_date"])
    op.create_index("ix_daily_ledgers_status", "daily_ledgers", ["status"])

    op.create_table(
        "daily_ledger_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ledger_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.Enum(*DIRECTIONS, name="ledgerdirection"), nullable=False),
        sa.Column("category", sa.Enum(*CATEGORIES, name="ledgercategory"), nullable=False),
        sa.Column("counterparty", sa.String(255), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("bank_account", sa.String(255), nullable=True),
        sa.Column("reference_number", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["ledger_id"], ["daily_ledgers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_daily_ledger_lines_ledger_id", "daily_ledger_lines", ["ledger_id"])
    op.create_index("ix_daily_ledger_lines_direction", "daily_ledger_lines", ["direction"])
    op.create_index("ix_daily_ledger_lines_category", "daily_ledger_lines", ["category"])
    op.create_index("ix_daily_ledger_lines_client_id", "daily_ledger_lines", ["client_id"])
    op.create_index("ix_daily_ledger_lines_supplier_id", "daily_ledger_lines", ["supplier_id"])
    op.create_index("ix_daily_ledger_lines_reference_number", "daily_ledger_lines", ["reference_number"])

    op.create_table(
        "daily_ledger_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ledger_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["ledger_id"], ["daily_ledgers.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_daily_ledger_notes_ledger_id", "daily_ledger_notes", ["ledger_id"])


def downgrade() -> None:
    op.drop_table("daily_ledger_notes")
    op.drop_table("daily_ledger_lines")
    op.drop_table("daily_ledgers")
