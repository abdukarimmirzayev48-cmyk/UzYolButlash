"""supplier finance module

Revision ID: 20260624_0007
Revises: 20260624_0006
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0007"
down_revision = "20260624_0006"
branch_labels = None
depends_on = None


supplierinvoicetype = sa.Enum("advance", "product_purchase", "transport", "adjustment", "other", name="supplierinvoicetype")
supplierinvoicestatus = sa.Enum("draft", "received", "partially_paid", "paid", "overdue", "cancelled", name="supplierinvoicestatus")
supplierpaymentmethod = sa.Enum("bank_transfer", "cash", "other", name="supplierpaymentmethod")
supplierpaymentstatus = sa.Enum("paid", "unallocated", "partially_allocated", "allocated", "cancelled", name="supplierpaymentstatus")
supplierfinancedocumenttype = sa.Enum("supplier_invoice_file", "payment_order", "bank_statement", "reconciliation_act", "other", name="supplierfinancedocumenttype")


def timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False)]


def upgrade() -> None:
    op.create_table(
        "supplier_invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=False),
        sa.Column("supplier_offer_id", sa.Integer(), nullable=True),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=True),
        sa.Column("logistics_id", sa.Integer(), nullable=True),
        sa.Column("invoice_number", sa.String(length=128), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("invoice_type", supplierinvoicetype, nullable=False),
        sa.Column("status", supplierinvoicestatus, nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("remaining_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["logistics_id"], ["logistics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_offer_id"], ["supplier_offers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "supplier_id", "procurement_id", "supplier_offer_id", "delivery_batch_id", "logistics_id", "invoice_number", "invoice_date", "due_date", "invoice_type", "status"]:
        op.create_index(op.f(f"ix_supplier_invoices_{col}"), "supplier_invoices", [col], unique=False)

    op.create_table(
        "supplier_invoice_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_invoice_id", sa.Integer(), nullable=False),
        sa.Column("procurement_item_id", sa.Integer(), nullable=True),
        sa.Column("supplier_offer_item_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=True),
        sa.Column("unit", sa.String(length=64), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_with_vat", sa.Numeric(18, 2), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["procurement_item_id"], ["procurement_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_invoice_id"], ["supplier_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_offer_item_id"], ["supplier_offer_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["supplier_invoice_id", "procurement_item_id", "supplier_offer_item_id"]:
        op.create_index(op.f(f"ix_supplier_invoice_items_{col}"), "supplier_invoice_items", [col], unique=False)

    op.create_table(
        "supplier_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("payment_number", sa.String(length=128), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("payment_method", supplierpaymentmethod, nullable=False),
        sa.Column("bank_account", sa.String(length=255), nullable=True),
        sa.Column("reference_number", sa.String(length=255), nullable=True),
        sa.Column("status", supplierpaymentstatus, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "supplier_id", "payment_number", "payment_date", "payment_method", "bank_account", "reference_number", "status"]:
        op.create_index(op.f(f"ix_supplier_payments_{col}"), "supplier_payments", [col], unique=False)

    op.create_table(
        "supplier_payment_allocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_payment_id", sa.Integer(), nullable=False),
        sa.Column("supplier_invoice_id", sa.Integer(), nullable=False),
        sa.Column("allocated_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_invoice_id"], ["supplier_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_payment_id"], ["supplier_payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_supplier_payment_allocations_supplier_invoice_id"), "supplier_payment_allocations", ["supplier_invoice_id"], unique=False)
    op.create_index(op.f("ix_supplier_payment_allocations_supplier_payment_id"), "supplier_payment_allocations", ["supplier_payment_id"], unique=False)

    op.create_table(
        "supplier_finance_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=True),
        sa.Column("supplier_invoice_id", sa.Integer(), nullable=True),
        sa.Column("supplier_payment_id", sa.Integer(), nullable=True),
        sa.Column("document_type", supplierfinancedocumenttype, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_invoice_id"], ["supplier_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_payment_id"], ["supplier_payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["supplier_id", "procurement_id", "supplier_invoice_id", "supplier_payment_id", "document_type"]:
        op.create_index(op.f(f"ix_supplier_finance_documents_{col}"), "supplier_finance_documents", [col], unique=False)

    op.create_table(
        "supplier_finance_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=True),
        sa.Column("supplier_invoice_id", sa.Integer(), nullable=True),
        sa.Column("supplier_payment_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_invoice_id"], ["supplier_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_payment_id"], ["supplier_payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["supplier_id", "procurement_id", "supplier_invoice_id", "supplier_payment_id"]:
        op.create_index(op.f(f"ix_supplier_finance_notes_{col}"), "supplier_finance_notes", [col], unique=False)


def downgrade() -> None:
    for col in reversed(["supplier_id", "procurement_id", "supplier_invoice_id", "supplier_payment_id"]):
        op.drop_index(op.f(f"ix_supplier_finance_notes_{col}"), table_name="supplier_finance_notes")
    op.drop_table("supplier_finance_notes")
    for col in reversed(["supplier_id", "procurement_id", "supplier_invoice_id", "supplier_payment_id", "document_type"]):
        op.drop_index(op.f(f"ix_supplier_finance_documents_{col}"), table_name="supplier_finance_documents")
    op.drop_table("supplier_finance_documents")
    op.drop_index(op.f("ix_supplier_payment_allocations_supplier_payment_id"), table_name="supplier_payment_allocations")
    op.drop_index(op.f("ix_supplier_payment_allocations_supplier_invoice_id"), table_name="supplier_payment_allocations")
    op.drop_table("supplier_payment_allocations")
    for col in reversed(["id", "supplier_id", "payment_number", "payment_date", "payment_method", "bank_account", "reference_number", "status"]):
        op.drop_index(op.f(f"ix_supplier_payments_{col}"), table_name="supplier_payments")
    op.drop_table("supplier_payments")
    for col in reversed(["supplier_invoice_id", "procurement_item_id", "supplier_offer_item_id"]):
        op.drop_index(op.f(f"ix_supplier_invoice_items_{col}"), table_name="supplier_invoice_items")
    op.drop_table("supplier_invoice_items")
    for col in reversed(["id", "supplier_id", "procurement_id", "supplier_offer_id", "delivery_batch_id", "logistics_id", "invoice_number", "invoice_date", "due_date", "invoice_type", "status"]):
        op.drop_index(op.f(f"ix_supplier_invoices_{col}"), table_name="supplier_invoices")
    op.drop_table("supplier_invoices")
    supplierfinancedocumenttype.drop(op.get_bind(), checkfirst=True)
    supplierpaymentstatus.drop(op.get_bind(), checkfirst=True)
    supplierpaymentmethod.drop(op.get_bind(), checkfirst=True)
    supplierinvoicestatus.drop(op.get_bind(), checkfirst=True)
    supplierinvoicetype.drop(op.get_bind(), checkfirst=True)
