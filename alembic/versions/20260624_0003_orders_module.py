"""orders module

Revision ID: 20260624_0003
Revises: 20260624_0002
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0003"
down_revision = "20260624_0002"
branch_labels = None
depends_on = None


orderstatus = sa.Enum(
    "draft", "created", "supplier_search", "supplier_selected", "supplier_confirmed", "waiting_payment",
    "ready_for_delivery", "in_delivery", "partially_delivered", "delivered", "documents_pending", "closed",
    "on_hold", "cancelled", name="orderstatus"
)
fulfillmenttype = sa.Enum("direct_supplier_to_customer", "company_managed_delivery", name="fulfillmenttype")
sourcetype = sa.Enum("russia_direct", "uzbekistan_local", "jarkurgan", "other", name="sourcetype")
supplierstatus = sa.Enum("not_selected", "searching", "selected", "confirmed", "changed", name="supplierstatus")
orderdocumenttype = sa.Enum("order_request", "supplier_offer", "supplier_confirmation", "internal_file", "other", name="orderdocumenttype")


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("order_number", sa.String(length=128), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("required_date", sa.Date(), nullable=True),
        sa.Column("status", orderstatus, nullable=False),
        sa.Column("fulfillment_type", fulfillmenttype, nullable=False),
        sa.Column("source_type", sourcetype, nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=True),
        sa.Column("supplier_status", supplierstatus, nullable=False),
        sa.Column("supplier_notes", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("product_subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("markup_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("markup_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("logistics_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["client_id", "contract_id", "id", "order_number", "order_date", "required_date", "status", "fulfillment_type", "source_type", "supplier_id", "supplier_name", "supplier_status"]:
        op.create_index(op.f(f"ix_orders_{col}"), "orders", [col], unique=False)

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("contract_item_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_with_vat", sa.Numeric(18, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_item_id"], ["contract_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_items_order_id"), "order_items", ["order_id"], unique=False)
    op.create_index(op.f("ix_order_items_contract_item_id"), "order_items", ["contract_item_id"], unique=False)
    op.create_index(op.f("ix_order_items_product_name"), "order_items", ["product_name"], unique=False)

    op.create_table(
        "order_supplier_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=False),
        sa.Column("offered_price", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("available_quantity", sa.Numeric(18, 3), nullable=True),
        sa.Column("ready_date", sa.Date(), nullable=True),
        sa.Column("delivery_terms", sa.Text(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_supplier_options_order_id"), "order_supplier_options", ["order_id"], unique=False)
    op.create_index(op.f("ix_order_supplier_options_supplier_id"), "order_supplier_options", ["supplier_id"], unique=False)

    op.create_table(
        "order_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("document_type", orderdocumenttype, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_documents_order_id"), "order_documents", ["order_id"], unique=False)
    op.create_index(op.f("ix_order_documents_document_type"), "order_documents", ["document_type"], unique=False)

    op.create_table(
        "order_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_notes_order_id"), "order_notes", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_order_notes_order_id"), table_name="order_notes")
    op.drop_table("order_notes")
    op.drop_index(op.f("ix_order_documents_document_type"), table_name="order_documents")
    op.drop_index(op.f("ix_order_documents_order_id"), table_name="order_documents")
    op.drop_table("order_documents")
    op.drop_index(op.f("ix_order_supplier_options_supplier_id"), table_name="order_supplier_options")
    op.drop_index(op.f("ix_order_supplier_options_order_id"), table_name="order_supplier_options")
    op.drop_table("order_supplier_options")
    op.drop_index(op.f("ix_order_items_product_name"), table_name="order_items")
    op.drop_index(op.f("ix_order_items_contract_item_id"), table_name="order_items")
    op.drop_index(op.f("ix_order_items_order_id"), table_name="order_items")
    op.drop_table("order_items")
    for col in reversed(["client_id", "contract_id", "id", "order_number", "order_date", "required_date", "status", "fulfillment_type", "source_type", "supplier_id", "supplier_name", "supplier_status"]):
        op.drop_index(op.f(f"ix_orders_{col}"), table_name="orders")
    op.drop_table("orders")
    orderdocumenttype.drop(op.get_bind(), checkfirst=True)
    supplierstatus.drop(op.get_bind(), checkfirst=True)
    sourcetype.drop(op.get_bind(), checkfirst=True)
    fulfillmenttype.drop(op.get_bind(), checkfirst=True)
    orderstatus.drop(op.get_bind(), checkfirst=True)
