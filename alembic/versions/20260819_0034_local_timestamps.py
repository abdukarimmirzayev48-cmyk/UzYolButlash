"""Store timestamps in local time (Asia/Tashkent) instead of UTC

Revision ID: 20260819_0034
Revises: 20260819_0033
Create Date: 2026-08-19

Most audit stamps were written with ``datetime.utcnow`` while the newer tables
(Ijro, audit log) used ``datetime.now``. The server runs in Asia/Tashkent, so
the two conventions sat five hours apart and the interface -- which formats a
naive value as wall-clock -- showed the older ones five hours early.

Local time is the convention that can be made consistent: every date the user
types (deadlines, delivery dates) is already a local wall-clock value with no
offset attached, so converting those to UTC would mean guessing at input time.
The models now all use ``datetime.now``; this migration brings the values that
were written as UTC up to the same footing.

Only system-generated stamps are touched (created_at / updated_at /
uploaded_at). Business dates the user entered have no default and were never
written in UTC, so they are deliberately left alone. A uniform shift preserves
every ordering these columns take part in.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260819_0034"
down_revision = "20260819_0033"
branch_labels = None
depends_on = None

# Asia/Tashkent is +05 all year -- Uzbekistan has had no daylight saving since
# 1995, so a constant offset is exact rather than an approximation.
OFFSET_HOURS = 5

COLUMNS = [
    ("attendance_employees", "created_at"),
    ("attendance_employees", "updated_at"),
    ("attendance_records", "created_at"),
    ("attendance_records", "updated_at"),
    ("client_addresses", "created_at"),
    ("client_addresses", "updated_at"),
    ("client_bank_accounts", "created_at"),
    ("client_bank_accounts", "updated_at"),
    ("client_contacts", "created_at"),
    ("client_contacts", "updated_at"),
    ("client_documents", "uploaded_at"),
    ("client_notes", "created_at"),
    ("clients", "created_at"),
    ("clients", "updated_at"),
    ("company_registry", "created_at"),
    ("company_registry", "updated_at"),
    ("contract_documents", "uploaded_at"),
    ("contract_files", "created_at"),
    ("contract_items", "created_at"),
    ("contract_items", "updated_at"),
    ("contract_notes", "created_at"),
    ("contract_parse_sessions", "created_at"),
    ("contract_parse_sessions", "updated_at"),
    ("contract_payment_terms", "created_at"),
    ("contract_payment_terms", "updated_at"),
    ("contract_transport_terms", "created_at"),
    ("contract_transport_terms", "updated_at"),
    ("contracts", "created_at"),
    ("contracts", "updated_at"),
    ("customer_invoice_items", "created_at"),
    ("customer_invoice_items", "updated_at"),
    ("customer_invoices", "created_at"),
    ("customer_invoices", "updated_at"),
    ("customer_payments", "created_at"),
    ("customer_payments", "updated_at"),
    ("customer_request_schedules", "created_at"),
    ("customer_request_schedules", "updated_at"),
    ("customer_request_status_history", "created_at"),
    ("customer_requests", "created_at"),
    ("customer_requests", "updated_at"),
    ("delivery_batch_documents", "uploaded_at"),
    ("delivery_batch_items", "created_at"),
    ("delivery_batch_items", "updated_at"),
    ("delivery_batch_notes", "created_at"),
    ("delivery_batches", "created_at"),
    ("delivery_batches", "updated_at"),
    ("departments", "created_at"),
    ("departments", "updated_at"),
    ("exchange_tickets", "created_at"),
    ("exchange_tickets", "updated_at"),
    ("finance_documents", "uploaded_at"),
    ("finance_notes", "created_at"),
    ("logistics", "created_at"),
    ("logistics", "updated_at"),
    ("logistics_documents", "uploaded_at"),
    ("logistics_notes", "created_at"),
    ("order_documents", "uploaded_at"),
    ("order_items", "created_at"),
    ("order_items", "updated_at"),
    ("order_notes", "created_at"),
    ("order_supplier_options", "created_at"),
    ("order_supplier_options", "updated_at"),
    ("orders", "created_at"),
    ("orders", "updated_at"),
    ("payment_allocations", "created_at"),
    ("procurement_documents", "uploaded_at"),
    ("procurement_items", "created_at"),
    ("procurement_items", "updated_at"),
    ("procurement_notes", "created_at"),
    ("procurements", "created_at"),
    ("procurements", "updated_at"),
    ("product_categories", "created_at"),
    ("product_categories", "updated_at"),
    ("products", "created_at"),
    ("products", "updated_at"),
    ("stock_allocations", "created_at"),
    ("stock_allocations", "updated_at"),
    ("stock_locations", "created_at"),
    ("stock_locations", "updated_at"),
    ("stock_lots", "created_at"),
    ("stock_lots", "updated_at"),
    ("stock_movements", "created_at"),
    ("supplier_addresses", "created_at"),
    ("supplier_addresses", "updated_at"),
    ("supplier_bank_accounts", "created_at"),
    ("supplier_bank_accounts", "updated_at"),
    ("supplier_contacts", "created_at"),
    ("supplier_contacts", "updated_at"),
    ("supplier_documents", "uploaded_at"),
    ("supplier_finance_documents", "uploaded_at"),
    ("supplier_finance_notes", "created_at"),
    ("supplier_invoice_items", "created_at"),
    ("supplier_invoice_items", "updated_at"),
    ("supplier_invoices", "created_at"),
    ("supplier_invoices", "updated_at"),
    ("supplier_notes", "created_at"),
    ("supplier_offer_items", "created_at"),
    ("supplier_offer_items", "updated_at"),
    ("supplier_offers", "created_at"),
    ("supplier_offers", "updated_at"),
    ("supplier_payment_allocations", "created_at"),
    ("supplier_payments", "created_at"),
    ("supplier_payments", "updated_at"),
    ("suppliers", "created_at"),
    ("suppliers", "updated_at"),
    ("tasks", "created_at"),
    ("tasks", "updated_at"),
    ("transport_fuel_logs", "created_at"),
    ("transport_fuel_logs", "updated_at"),
    ("transports", "created_at"),
    ("transports", "updated_at"),
    ("users", "created_at"),
    ("users", "updated_at"),
]


def _shift(sign: str) -> None:
    bind = op.get_bind()
    existing = {row[0] for row in bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))}
    for table, column in COLUMNS:
        if table not in existing:
            continue
        columns = {row[1] for row in bind.execute(sa.text(f"PRAGMA table_info({table})"))}
        if column not in columns:
            continue
        # datetime() truncates to whole seconds, so the original fractional
        # part is carried across verbatim -- these columns order rows that can
        # be written within the same second.
        bind.execute(
            sa.text(
                f"UPDATE {table} SET {column} = "
                f"strftime('%Y-%m-%d %H:%M:%S', {column}, '{sign}{OFFSET_HOURS} hours') || "
                f"CASE WHEN instr({column}, '.') > 0 THEN substr({column}, instr({column}, '.')) ELSE '' END "
                f"WHERE {column} IS NOT NULL"
            )
        )


def upgrade() -> None:
    _shift("+")


def downgrade() -> None:
    _shift("-")
