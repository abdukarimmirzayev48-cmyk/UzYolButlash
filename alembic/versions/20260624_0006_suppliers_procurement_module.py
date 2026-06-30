"""suppliers and procurement module

Revision ID: 20260624_0006
Revises: 20260624_0005
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0006"
down_revision = "20260624_0005"
branch_labels = None
depends_on = None


supplieraddresstype = sa.Enum("legal", "loading", "warehouse", "factory", "other", name="supplieraddresstype")
supplierdocumenttype = sa.Enum("requisites", "certificate", "license", "company_card", "contract", "other", name="supplierdocumenttype")
procurementstatus = sa.Enum(
    "draft",
    "supplier_search",
    "offers_received",
    "supplier_selected",
    "supplier_confirmed",
    "purchase_approved",
    "waiting_supplier_ready",
    "ready_for_pickup",
    "ready_for_delivery",
    "completed",
    "cancelled",
    "issue",
    name="procurementstatus",
)
supplierofferstatus = sa.Enum("draft", "sent", "received", "selected", "partially_selected", "rejected", "expired", "cancelled", name="supplierofferstatus")
procurementdocumenttype = sa.Enum("supplier_offer", "supplier_confirmation", "purchase_agreement", "invoice_file", "quality_certificate", "other", name="procurementdocumenttype")


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("inn", sa.String(length=32), nullable=True),
        sa.Column("oked", sa.String(length=32), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "name", "inn", "phone"]:
        op.create_index(op.f(f"ix_suppliers_{col}"), "suppliers", [col], unique=False)

    op.create_table(
        "supplier_contacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_supplier_contacts_supplier_id"), "supplier_contacts", ["supplier_id"], unique=False)
    op.create_index(op.f("ix_supplier_contacts_phone"), "supplier_contacts", ["phone"], unique=False)

    op.create_table(
        "supplier_addresses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("address_type", supplieraddresstype, nullable=False),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.Column("district", sa.String(length=255), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("latitude", sa.String(length=64), nullable=True),
        sa.Column("longitude", sa.String(length=64), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["supplier_id", "address_type", "region"]:
        op.create_index(op.f(f"ix_supplier_addresses_{col}"), "supplier_addresses", [col], unique=False)

    op.create_table(
        "supplier_bank_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("mfo", sa.String(length=32), nullable=True),
        sa.Column("account_number", sa.String(length=64), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_supplier_bank_accounts_supplier_id"), "supplier_bank_accounts", ["supplier_id"], unique=False)

    op.create_table(
        "supplier_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("document_type", supplierdocumenttype, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_supplier_documents_supplier_id"), "supplier_documents", ["supplier_id"], unique=False)
    op.create_index(op.f("ix_supplier_documents_document_type"), "supplier_documents", ["document_type"], unique=False)

    op.create_table(
        "supplier_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_supplier_notes_supplier_id"), "supplier_notes", ["supplier_id"], unique=False)

    op.create_table(
        "procurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("procurement_number", sa.String(length=128), nullable=False),
        sa.Column("procurement_date", sa.Date(), nullable=False),
        sa.Column("required_date", sa.Date(), nullable=True),
        sa.Column("status", procurementstatus, nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("fulfillment_type", sa.String(length=64), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("estimated_purchase_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("final_purchase_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
    )
    for col in ["id", "order_id", "contract_id", "client_id", "procurement_number", "procurement_date", "required_date", "status", "source_type", "fulfillment_type"]:
        op.create_index(op.f(f"ix_procurements_{col}"), "procurements", [col], unique=False)

    op.create_table(
        "procurement_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("contract_item_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("required_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("purchased_quantity", sa.Numeric(18, 3), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["contract_item_id"], ["contract_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["procurement_id", "order_item_id", "contract_item_id", "product_name"]:
        op.create_index(op.f(f"ix_procurement_items_{col}"), "procurement_items", [col], unique=False)

    op.create_table(
        "supplier_offers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=False),
        sa.Column("offer_number", sa.String(length=128), nullable=False),
        sa.Column("offer_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("status", supplierofferstatus, nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("total_product_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("transport_included", sa.Boolean(), nullable=False),
        sa.Column("delivery_terms", sa.Text(), nullable=True),
        sa.Column("estimated_delivery_cost", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("ready_date", sa.Date(), nullable=True),
        sa.Column("payment_terms", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["procurement_id", "supplier_id", "supplier_name", "offer_number", "status"]:
        op.create_index(op.f(f"ix_supplier_offers_{col}"), "supplier_offers", [col], unique=False)

    op.create_table(
        "supplier_offer_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_offer_id", sa.Integer(), nullable=False),
        sa.Column("procurement_item_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("contract_item_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("offered_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("selected_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_with_vat", sa.Numeric(18, 2), nullable=False),
        sa.Column("transport_included", sa.Boolean(), nullable=False),
        sa.Column("delivery_terms", sa.Text(), nullable=True),
        sa.Column("ready_date", sa.Date(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["contract_item_id"], ["contract_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["procurement_item_id"], ["procurement_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_offer_id"], ["supplier_offers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["supplier_offer_id", "procurement_item_id", "order_item_id", "contract_item_id"]:
        op.create_index(op.f(f"ix_supplier_offer_items_{col}"), "supplier_offer_items", [col], unique=False)

    op.create_table(
        "procurement_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=False),
        sa.Column("supplier_offer_id", sa.Integer(), nullable=True),
        sa.Column("document_type", procurementdocumenttype, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_offer_id"], ["supplier_offers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_procurement_documents_procurement_id"), "procurement_documents", ["procurement_id"], unique=False)
    op.create_index(op.f("ix_procurement_documents_supplier_offer_id"), "procurement_documents", ["supplier_offer_id"], unique=False)

    op.create_table(
        "procurement_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("procurement_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["procurement_id"], ["procurements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_procurement_notes_procurement_id"), "procurement_notes", ["procurement_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_procurement_notes_procurement_id"), table_name="procurement_notes")
    op.drop_table("procurement_notes")
    op.drop_index(op.f("ix_procurement_documents_supplier_offer_id"), table_name="procurement_documents")
    op.drop_index(op.f("ix_procurement_documents_procurement_id"), table_name="procurement_documents")
    op.drop_table("procurement_documents")
    for col in reversed(["supplier_offer_id", "procurement_item_id", "order_item_id", "contract_item_id"]):
        op.drop_index(op.f(f"ix_supplier_offer_items_{col}"), table_name="supplier_offer_items")
    op.drop_table("supplier_offer_items")
    for col in reversed(["procurement_id", "supplier_id", "supplier_name", "offer_number", "status"]):
        op.drop_index(op.f(f"ix_supplier_offers_{col}"), table_name="supplier_offers")
    op.drop_table("supplier_offers")
    for col in reversed(["procurement_id", "order_item_id", "contract_item_id", "product_name"]):
        op.drop_index(op.f(f"ix_procurement_items_{col}"), table_name="procurement_items")
    op.drop_table("procurement_items")
    for col in reversed(["id", "order_id", "contract_id", "client_id", "procurement_number", "procurement_date", "required_date", "status", "source_type", "fulfillment_type"]):
        op.drop_index(op.f(f"ix_procurements_{col}"), table_name="procurements")
    op.drop_table("procurements")
    op.drop_index(op.f("ix_supplier_notes_supplier_id"), table_name="supplier_notes")
    op.drop_table("supplier_notes")
    op.drop_index(op.f("ix_supplier_documents_document_type"), table_name="supplier_documents")
    op.drop_index(op.f("ix_supplier_documents_supplier_id"), table_name="supplier_documents")
    op.drop_table("supplier_documents")
    op.drop_index(op.f("ix_supplier_bank_accounts_supplier_id"), table_name="supplier_bank_accounts")
    op.drop_table("supplier_bank_accounts")
    for col in reversed(["supplier_id", "address_type", "region"]):
        op.drop_index(op.f(f"ix_supplier_addresses_{col}"), table_name="supplier_addresses")
    op.drop_table("supplier_addresses")
    op.drop_index(op.f("ix_supplier_contacts_phone"), table_name="supplier_contacts")
    op.drop_index(op.f("ix_supplier_contacts_supplier_id"), table_name="supplier_contacts")
    op.drop_table("supplier_contacts")
    for col in reversed(["id", "name", "inn", "phone"]):
        op.drop_index(op.f(f"ix_suppliers_{col}"), table_name="suppliers")
    op.drop_table("suppliers")
    procurementdocumenttype.drop(op.get_bind(), checkfirst=True)
    supplierofferstatus.drop(op.get_bind(), checkfirst=True)
    procurementstatus.drop(op.get_bind(), checkfirst=True)
    supplierdocumenttype.drop(op.get_bind(), checkfirst=True)
    supplieraddresstype.drop(op.get_bind(), checkfirst=True)
