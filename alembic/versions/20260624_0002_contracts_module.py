"""contracts module

Revision ID: 20260624_0002
Revises: 20260624_0001
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0002"
down_revision = "20260624_0001"
branch_labels = None
depends_on = None


contract_status = sa.Enum("draft", "signed", "active", "completed", "cancelled", name="contractstatus")
transport_payment_type = sa.Enum(
    "included", "separate_invoice", "customer_pays_directly", name="transportpaymenttype"
)
delivery_method = sa.Enum("auto", "railway", "mixed", name="deliverymethod")
contract_document_type = sa.Enum(
    "contract_pdf", "specification", "additional_agreement", "invoice", "act", "other", name="contractdocumenttype"
)


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("contract_number", sa.String(length=128), nullable=False),
        sa.Column("contract_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("status", contract_status, nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contracts_client_id"), "contracts", ["client_id"], unique=False)
    op.create_index(op.f("ix_contracts_contract_date"), "contracts", ["contract_date"], unique=False)
    op.create_index(op.f("ix_contracts_contract_number"), "contracts", ["contract_number"], unique=False)
    op.create_index(op.f("ix_contracts_id"), "contracts", ["id"], unique=False)
    op.create_index(op.f("ix_contracts_status"), "contracts", ["status"], unique=False)
    op.create_index(op.f("ix_contracts_valid_until"), "contracts", ["valid_until"], unique=False)

    op.create_table(
        "contract_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("product_code", sa.String(length=128), nullable=True),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_with_vat", sa.Numeric(18, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contract_items_contract_id"), "contract_items", ["contract_id"], unique=False)
    op.create_index(op.f("ix_contract_items_product_name"), "contract_items", ["product_name"], unique=False)

    op.create_table(
        "contract_payment_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("advance_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("advance_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("remaining_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("advance_due_days", sa.Integer(), nullable=False),
        sa.Column("batch_payment_due_days", sa.Integer(), nullable=False),
        sa.Column("remaining_payment_rule", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contract_id"),
    )
    op.create_index(op.f("ix_contract_payment_terms_contract_id"), "contract_payment_terms", ["contract_id"], unique=False)

    op.create_table(
        "contract_transport_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("transport_payment_type", transport_payment_type, nullable=False),
        sa.Column("delivery_method", delivery_method, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contract_id"),
    )
    op.create_index(op.f("ix_contract_transport_terms_contract_id"), "contract_transport_terms", ["contract_id"], unique=False)

    op.create_table(
        "contract_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("document_type", contract_document_type, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contract_documents_contract_id"), "contract_documents", ["contract_id"], unique=False)
    op.create_index(op.f("ix_contract_documents_document_type"), "contract_documents", ["document_type"], unique=False)

    op.create_table(
        "contract_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contract_notes_contract_id"), "contract_notes", ["contract_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_contract_notes_contract_id"), table_name="contract_notes")
    op.drop_table("contract_notes")
    op.drop_index(op.f("ix_contract_documents_document_type"), table_name="contract_documents")
    op.drop_index(op.f("ix_contract_documents_contract_id"), table_name="contract_documents")
    op.drop_table("contract_documents")
    op.drop_index(op.f("ix_contract_transport_terms_contract_id"), table_name="contract_transport_terms")
    op.drop_table("contract_transport_terms")
    op.drop_index(op.f("ix_contract_payment_terms_contract_id"), table_name="contract_payment_terms")
    op.drop_table("contract_payment_terms")
    op.drop_index(op.f("ix_contract_items_product_name"), table_name="contract_items")
    op.drop_index(op.f("ix_contract_items_contract_id"), table_name="contract_items")
    op.drop_table("contract_items")
    op.drop_index(op.f("ix_contracts_valid_until"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_status"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_id"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_contract_number"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_contract_date"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_client_id"), table_name="contracts")
    op.drop_table("contracts")
    contract_document_type.drop(op.get_bind(), checkfirst=True)
    delivery_method.drop(op.get_bind(), checkfirst=True)
    transport_payment_type.drop(op.get_bind(), checkfirst=True)
    contract_status.drop(op.get_bind(), checkfirst=True)
