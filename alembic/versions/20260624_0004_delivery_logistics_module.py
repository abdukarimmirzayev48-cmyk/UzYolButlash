"""delivery batches and logistics module

Revision ID: 20260624_0004
Revises: 20260624_0003
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0004"
down_revision = "20260624_0003"
branch_labels = None
depends_on = None


batchstatus = sa.Enum("planned", "supplier_preparing", "ready_for_loading", "waiting_payment", "loading", "loaded", "in_transit", "arrived", "unloading", "accepted", "quantity_difference", "documents_pending", "completed", "cancelled", "issue", name="batchstatus")
autodeliverymethod = sa.Enum("auto", name="autodeliverymethod")
logisticsstatus = sa.Enum("not_assigned", "carrier_search", "carrier_assigned", "vehicle_assigned", "loading", "in_transit", "arrived", "unloading", "completed", "cancelled", "issue", name="logisticsstatus")
paidby = sa.Enum("company", "customer", "supplier", name="paidby")
batchdocumenttype = sa.Enum("ttn", "acceptance_act", "quality_certificate", "supplier_invoice", "customer_invoice", "photo", "other", name="batchdocumenttype")
logisticsdocumenttype = sa.Enum("transport_invoice", "driver_document", "vehicle_document", "loading_photo", "delivery_photo", "other", name="logisticsdocumenttype")


def upgrade() -> None:
    op.create_table(
        "delivery_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("batch_number", sa.String(length=128), nullable=False),
        sa.Column("batch_date", sa.Date(), nullable=False),
        sa.Column("planned_loading_date", sa.Date(), nullable=True),
        sa.Column("planned_delivery_date", sa.Date(), nullable=True),
        sa.Column("actual_loading_date", sa.Date(), nullable=True),
        sa.Column("actual_delivery_date", sa.Date(), nullable=True),
        sa.Column("accepted_date", sa.Date(), nullable=True),
        sa.Column("status", batchstatus, nullable=False),
        sa.Column("fulfillment_type", sa.String(length=64), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("delivery_method", autodeliverymethod, nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("supplier_name", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "order_id", "contract_id", "client_id", "batch_number", "batch_date", "planned_delivery_date", "status", "fulfillment_type", "source_type", "supplier_id", "supplier_name"]:
        op.create_index(op.f(f"ix_delivery_batches_{col}"), "delivery_batches", [col], unique=False)

    op.create_table(
        "delivery_batch_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("contract_item_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("planned_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("loaded_quantity", sa.Numeric(18, 3), nullable=True),
        sa.Column("accepted_quantity", sa.Numeric(18, 3), nullable=True),
        sa.Column("difference_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_item_id"], ["contract_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_delivery_batch_items_delivery_batch_id"), "delivery_batch_items", ["delivery_batch_id"], unique=False)
    op.create_index(op.f("ix_delivery_batch_items_order_item_id"), "delivery_batch_items", ["order_item_id"], unique=False)
    op.create_index(op.f("ix_delivery_batch_items_product_name"), "delivery_batch_items", ["product_name"], unique=False)

    op.create_table(
        "logistics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=False),
        sa.Column("delivery_method", autodeliverymethod, nullable=False),
        sa.Column("status", logisticsstatus, nullable=False),
        sa.Column("carrier_name", sa.String(length=255), nullable=True),
        sa.Column("driver_name", sa.String(length=255), nullable=True),
        sa.Column("driver_phone", sa.String(length=64), nullable=True),
        sa.Column("vehicle_number", sa.String(length=64), nullable=True),
        sa.Column("trailer_number", sa.String(length=64), nullable=True),
        sa.Column("loading_address", sa.Text(), nullable=True),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("planned_pickup_date", sa.Date(), nullable=True),
        sa.Column("planned_delivery_date", sa.Date(), nullable=True),
        sa.Column("actual_pickup_date", sa.Date(), nullable=True),
        sa.Column("actual_delivery_date", sa.Date(), nullable=True),
        sa.Column("cost_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("customer_price", sa.Numeric(18, 2), nullable=True),
        sa.Column("paid_by", paidby, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("delivery_batch_id"),
    )
    for col in ["id", "delivery_batch_id", "status", "carrier_name", "driver_name", "driver_phone", "vehicle_number", "planned_delivery_date"]:
        op.create_index(op.f(f"ix_logistics_{col}"), "logistics", [col], unique=False)

    op.create_table("delivery_batch_documents", sa.Column("id", sa.Integer(), nullable=False), sa.Column("delivery_batch_id", sa.Integer(), nullable=False), sa.Column("document_type", batchdocumenttype, nullable=False), sa.Column("title", sa.String(length=255), nullable=False), sa.Column("file_url", sa.Text(), nullable=True), sa.Column("uploaded_by", sa.String(length=255), nullable=True), sa.Column("uploaded_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_delivery_batch_documents_delivery_batch_id"), "delivery_batch_documents", ["delivery_batch_id"], unique=False)
    op.create_index(op.f("ix_delivery_batch_documents_document_type"), "delivery_batch_documents", ["document_type"], unique=False)
    op.create_table("delivery_batch_notes", sa.Column("id", sa.Integer(), nullable=False), sa.Column("delivery_batch_id", sa.Integer(), nullable=False), sa.Column("note", sa.Text(), nullable=False), sa.Column("created_by", sa.String(length=255), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_delivery_batch_notes_delivery_batch_id"), "delivery_batch_notes", ["delivery_batch_id"], unique=False)
    op.create_table("logistics_documents", sa.Column("id", sa.Integer(), nullable=False), sa.Column("logistics_id", sa.Integer(), nullable=False), sa.Column("document_type", logisticsdocumenttype, nullable=False), sa.Column("title", sa.String(length=255), nullable=False), sa.Column("file_url", sa.Text(), nullable=True), sa.Column("uploaded_by", sa.String(length=255), nullable=True), sa.Column("uploaded_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["logistics_id"], ["logistics.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_logistics_documents_logistics_id"), "logistics_documents", ["logistics_id"], unique=False)
    op.create_index(op.f("ix_logistics_documents_document_type"), "logistics_documents", ["document_type"], unique=False)
    op.create_table("logistics_notes", sa.Column("id", sa.Integer(), nullable=False), sa.Column("logistics_id", sa.Integer(), nullable=False), sa.Column("note", sa.Text(), nullable=False), sa.Column("created_by", sa.String(length=255), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["logistics_id"], ["logistics.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_logistics_notes_logistics_id"), "logistics_notes", ["logistics_id"], unique=False)


def downgrade() -> None:
    for table, indexes in [
        ("logistics_notes", ["ix_logistics_notes_logistics_id"]),
        ("logistics_documents", ["ix_logistics_documents_document_type", "ix_logistics_documents_logistics_id"]),
        ("delivery_batch_notes", ["ix_delivery_batch_notes_delivery_batch_id"]),
        ("delivery_batch_documents", ["ix_delivery_batch_documents_document_type", "ix_delivery_batch_documents_delivery_batch_id"]),
    ]:
        for idx in indexes:
            op.drop_index(op.f(idx), table_name=table)
        op.drop_table(table)
    for col in reversed(["id", "delivery_batch_id", "status", "carrier_name", "driver_name", "driver_phone", "vehicle_number", "planned_delivery_date"]):
        op.drop_index(op.f(f"ix_logistics_{col}"), table_name="logistics")
    op.drop_table("logistics")
    op.drop_index(op.f("ix_delivery_batch_items_product_name"), table_name="delivery_batch_items")
    op.drop_index(op.f("ix_delivery_batch_items_order_item_id"), table_name="delivery_batch_items")
    op.drop_index(op.f("ix_delivery_batch_items_delivery_batch_id"), table_name="delivery_batch_items")
    op.drop_table("delivery_batch_items")
    for col in reversed(["id", "order_id", "contract_id", "client_id", "batch_number", "batch_date", "planned_delivery_date", "status", "fulfillment_type", "source_type", "supplier_id", "supplier_name"]):
        op.drop_index(op.f(f"ix_delivery_batches_{col}"), table_name="delivery_batches")
    op.drop_table("delivery_batches")
    logisticsdocumenttype.drop(op.get_bind(), checkfirst=True)
    batchdocumenttype.drop(op.get_bind(), checkfirst=True)
    paidby.drop(op.get_bind(), checkfirst=True)
    logisticsstatus.drop(op.get_bind(), checkfirst=True)
    autodeliverymethod.drop(op.get_bind(), checkfirst=True)
    batchstatus.drop(op.get_bind(), checkfirst=True)
