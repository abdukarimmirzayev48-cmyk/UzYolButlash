"""Ticket va qabul hujjatlari

Revision ID: 20260907_0062
Revises: 20260907_0061
Create Date: 2026-09-07

Mol zaxiraga hujjatsiz kirardi: ticket ochilishi bilan butun miqdor
tushardi va uni hech narsa tasdiqlamasdi. Endi qabul alohida amal va u
shartnoma hamda dalolatnoma fayli bilan rasmiylashtiriladi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260907_0062"
down_revision = "20260907_0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exchange_ticket_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("exchange_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("intake_id", sa.Integer(), sa.ForeignKey("exchange_ticket_intakes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_exchange_ticket_documents_ticket_id", "exchange_ticket_documents", ["ticket_id"])
    op.create_index("ix_exchange_ticket_documents_intake_id", "exchange_ticket_documents", ["intake_id"])
    op.create_index("ix_exchange_ticket_documents_document_type", "exchange_ticket_documents", ["document_type"])


def downgrade() -> None:
    op.drop_table("exchange_ticket_documents")
