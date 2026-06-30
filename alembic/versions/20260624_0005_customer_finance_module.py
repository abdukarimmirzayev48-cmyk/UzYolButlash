"""customer invoices and payments module

Revision ID: 20260624_0005
Revises: 20260624_0004
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0005"
down_revision = "20260624_0004"
branch_labels = None
depends_on = None


invoicetype = sa.Enum("advance", "batch_payment", "transport", "adjustment", "other", name="invoicetype")
invoicestatus = sa.Enum("draft", "issued", "partially_paid", "paid", "overdue", "cancelled", name="invoicestatus")
paymentmethod = sa.Enum("bank_transfer", "cash", "other", name="paymentmethod")
paymentstatus = sa.Enum("received", "unallocated", "partially_allocated", "allocated", "cancelled", name="paymentstatus")
financedocumenttype = sa.Enum("invoice_file", "payment_order", "bank_statement", "reconciliation_act", "other", name="financedocumenttype")


def upgrade() -> None:
    op.create_table(
        "customer_invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=True),
        sa.Column("logistics_id", sa.Integer(), nullable=True),
        sa.Column("invoice_number", sa.String(length=128), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("invoice_type", invoicetype, nullable=False),
        sa.Column("status", invoicestatus, nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("remaining_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["logistics_id"], ["logistics.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "client_id", "contract_id", "order_id", "delivery_batch_id", "logistics_id", "invoice_number", "invoice_date", "due_date", "invoice_type", "status"]:
        op.create_index(op.f(f"ix_customer_invoices_{col}"), "customer_invoices", [col], unique=False)

    op.create_table("customer_invoice_items", sa.Column("id", sa.Integer(), nullable=False), sa.Column("invoice_id", sa.Integer(), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("product_name", sa.String(length=255), nullable=True), sa.Column("unit", sa.String(length=64), nullable=True), sa.Column("quantity", sa.Numeric(18, 3), nullable=False), sa.Column("unit_price", sa.Numeric(18, 2), nullable=False), sa.Column("subtotal", sa.Numeric(18, 2), nullable=False), sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False), sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False), sa.Column("total_with_vat", sa.Numeric(18, 2), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["invoice_id"], ["customer_invoices.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_customer_invoice_items_invoice_id"), "customer_invoice_items", ["invoice_id"], unique=False)

    op.create_table("customer_payments", sa.Column("id", sa.Integer(), nullable=False), sa.Column("client_id", sa.Integer(), nullable=False), sa.Column("payment_number", sa.String(length=128), nullable=False), sa.Column("payment_date", sa.Date(), nullable=False), sa.Column("amount", sa.Numeric(18, 2), nullable=False), sa.Column("currency", sa.String(length=8), nullable=False), sa.Column("payment_method", paymentmethod, nullable=False), sa.Column("bank_account", sa.String(length=255), nullable=True), sa.Column("reference_number", sa.String(length=255), nullable=True), sa.Column("status", paymentstatus, nullable=False), sa.Column("notes", sa.Text(), nullable=True), sa.Column("created_by", sa.String(length=255), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"))
    for col in ["id", "client_id", "payment_number", "payment_date", "payment_method", "bank_account", "reference_number", "status"]:
        op.create_index(op.f(f"ix_customer_payments_{col}"), "customer_payments", [col], unique=False)

    op.create_table("payment_allocations", sa.Column("id", sa.Integer(), nullable=False), sa.Column("payment_id", sa.Integer(), nullable=False), sa.Column("invoice_id", sa.Integer(), nullable=False), sa.Column("allocated_amount", sa.Numeric(18, 2), nullable=False), sa.Column("created_by", sa.String(length=255), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["payment_id"], ["customer_payments.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["invoice_id"], ["customer_invoices.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_payment_allocations_payment_id"), "payment_allocations", ["payment_id"], unique=False)
    op.create_index(op.f("ix_payment_allocations_invoice_id"), "payment_allocations", ["invoice_id"], unique=False)

    op.create_table("finance_documents", sa.Column("id", sa.Integer(), nullable=False), sa.Column("client_id", sa.Integer(), nullable=False), sa.Column("contract_id", sa.Integer(), nullable=True), sa.Column("invoice_id", sa.Integer(), nullable=True), sa.Column("payment_id", sa.Integer(), nullable=True), sa.Column("document_type", financedocumenttype, nullable=False), sa.Column("title", sa.String(length=255), nullable=False), sa.Column("file_url", sa.Text(), nullable=True), sa.Column("uploaded_by", sa.String(length=255), nullable=True), sa.Column("uploaded_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["invoice_id"], ["customer_invoices.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["payment_id"], ["customer_payments.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_finance_documents_client_id"), "finance_documents", ["client_id"], unique=False)
    op.create_index(op.f("ix_finance_documents_invoice_id"), "finance_documents", ["invoice_id"], unique=False)
    op.create_index(op.f("ix_finance_documents_payment_id"), "finance_documents", ["payment_id"], unique=False)
    op.create_index(op.f("ix_finance_documents_document_type"), "finance_documents", ["document_type"], unique=False)

    op.create_table("finance_notes", sa.Column("id", sa.Integer(), nullable=False), sa.Column("client_id", sa.Integer(), nullable=False), sa.Column("contract_id", sa.Integer(), nullable=True), sa.Column("invoice_id", sa.Integer(), nullable=True), sa.Column("payment_id", sa.Integer(), nullable=True), sa.Column("note", sa.Text(), nullable=False), sa.Column("created_by", sa.String(length=255), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["invoice_id"], ["customer_invoices.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["payment_id"], ["customer_payments.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_finance_notes_client_id"), "finance_notes", ["client_id"], unique=False)
    op.create_index(op.f("ix_finance_notes_invoice_id"), "finance_notes", ["invoice_id"], unique=False)
    op.create_index(op.f("ix_finance_notes_payment_id"), "finance_notes", ["payment_id"], unique=False)


def downgrade() -> None:
    for table, indexes in [
        ("finance_notes", ["ix_finance_notes_payment_id", "ix_finance_notes_invoice_id", "ix_finance_notes_client_id"]),
        ("finance_documents", ["ix_finance_documents_document_type", "ix_finance_documents_payment_id", "ix_finance_documents_invoice_id", "ix_finance_documents_client_id"]),
        ("payment_allocations", ["ix_payment_allocations_invoice_id", "ix_payment_allocations_payment_id"]),
    ]:
        for idx in indexes:
            op.drop_index(op.f(idx), table_name=table)
        op.drop_table(table)
    for col in reversed(["id", "client_id", "payment_number", "payment_date", "payment_method", "bank_account", "reference_number", "status"]):
        op.drop_index(op.f(f"ix_customer_payments_{col}"), table_name="customer_payments")
    op.drop_table("customer_payments")
    op.drop_index(op.f("ix_customer_invoice_items_invoice_id"), table_name="customer_invoice_items")
    op.drop_table("customer_invoice_items")
    for col in reversed(["id", "client_id", "contract_id", "order_id", "delivery_batch_id", "logistics_id", "invoice_number", "invoice_date", "due_date", "invoice_type", "status"]):
        op.drop_index(op.f(f"ix_customer_invoices_{col}"), table_name="customer_invoices")
    op.drop_table("customer_invoices")
    financedocumenttype.drop(op.get_bind(), checkfirst=True)
    paymentstatus.drop(op.get_bind(), checkfirst=True)
    paymentmethod.drop(op.get_bind(), checkfirst=True)
    invoicestatus.drop(op.get_bind(), checkfirst=True)
    invoicetype.drop(op.get_bind(), checkfirst=True)
