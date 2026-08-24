"""Ticket bo'yicha bo'lib-bo'lib olingan molni yozib borish

Revision ID: 20260824_0042
Revises: 20260823_0041
Create Date: 2026-08-24

Ticket -- kvota, undagi miqdor bir yo'la emas, bo'lib-bo'lib olinadi. Ilgari
ticket ochilishi bilan butun miqdor zaxiraga tushardi: hali ta'minotchi
bazasidan chiqmagan mol ham bizniki bo'lib hisoblanardi va «kvotada qancha
qoldi» degan savolga javob beradigan raqam umuman yo'q edi.

Mavjud ticketlar uchun bittadan boshlang'ich qabul yoziladi -- miqdori o'sha
ticketning zaxira partiyasidagi dastlabki miqdor. Shu bilan hozirgi raqamlar
tiyinigacha o'zgarmay qoladi: olingan = zaxiraga tushgan, kvotada qolgan = 0.
Zaxira partiyasi yo'q ticketda esa hech narsa olinmagan.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260824_0042"
down_revision = "20260823_0041"
branch_labels = None
depends_on = None

MSG_BASELINE = "Tarix yuritish boshlangunga qadar olingan miqdor."


def upgrade() -> None:
    op.create_table(
        "exchange_ticket_intakes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("exchange_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("intake_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("document_number", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_exchange_ticket_intakes_ticket_id", "exchange_ticket_intakes", ["ticket_id"])
    op.create_index("ix_exchange_ticket_intakes_intake_date", "exchange_ticket_intakes", ["intake_date"])

    op.execute(
        sa.text(
            """
            INSERT INTO exchange_ticket_intakes
                (ticket_id, intake_date, quantity, document_number, notes, created_by, created_at, updated_at)
            SELECT t.id, t.ticket_date, l.quantity_initial, t.ticket_number, :note, 'system',
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM exchange_tickets t
            JOIN stock_lots l ON l.ticket_id = t.id
            WHERE l.quantity_initial > 0
            """
        ).bindparams(note=MSG_BASELINE)
    )


def downgrade() -> None:
    op.drop_index("ix_exchange_ticket_intakes_intake_date", table_name="exchange_ticket_intakes")
    op.drop_index("ix_exchange_ticket_intakes_ticket_id", table_name="exchange_ticket_intakes")
    op.drop_table("exchange_ticket_intakes")
