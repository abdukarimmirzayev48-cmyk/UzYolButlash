"""exchange tickets and supplier-held stock

Revision ID: 20260629_0009
Revises: 20260626_0008
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260629_0009"
down_revision = "20260626_0008"
branch_labels = None
depends_on = None


exchangeticketstatus = sa.Enum("draft", "opened", "partially_paid", "paid", "overdue", "closed", "cancelled", name="exchangeticketstatus")
stocklocationtype = sa.Enum("supplier_storage", "company_warehouse", "in_transit", "customer_site", "other", name="stocklocationtype")
ownershipstatus = sa.Enum("owned_by_company", name="ownershipstatus")
stockstatus = sa.Enum("available", "reserved", "partially_used", "used", "blocked", "cancelled", name="stockstatus")
stockallocationstatus = sa.Enum("reserved", "released", "picked_up", "delivered", "cancelled", name="stockallocationstatus")
stockmovementtype = sa.Enum("purchase_in", "reserve", "release_reserve", "pickup", "in_transit", "delivered", "adjustment", name="stockmovementtype")


def timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False)]


def add_supplier_held_source_type() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE sourcetype ADD VALUE IF NOT EXISTS 'supplier_held_stock'")


def upgrade() -> None:
    add_supplier_held_source_type()
    op.create_table(
        "exchange_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_number", sa.String(length=128), nullable=False),
        sa.Column("ticket_date", sa.Date(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("supplier_name", sa.String(length=255), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("vat_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("payment_term_days", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", exchangeticketstatus, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_number"),
    )
    for col in ["id", "ticket_number", "ticket_date", "supplier_id", "supplier_name", "product_id", "product_name", "due_date", "status"]:
        op.create_index(op.f(f"ix_exchange_tickets_{col}"), "exchange_tickets", [col], unique=False)

    op.create_table(
        "stock_locations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_type", stocklocationtype, nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.Column("district", sa.String(length=255), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "location_type", "supplier_id", "name", "region"]:
        op.create_index(op.f(f"ix_stock_locations_{col}"), "stock_locations", [col], unique=False)

    op.create_table(
        "stock_lots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("stock_location_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("quantity_initial", sa.Numeric(18, 3), nullable=False),
        sa.Column("quantity_available", sa.Numeric(18, 3), nullable=False),
        sa.Column("quantity_reserved", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("ownership_status", ownershipstatus, nullable=False),
        sa.Column("stock_status", stockstatus, nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["stock_location_id"], ["stock_locations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["ticket_id"], ["exchange_tickets.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_id", name="uq_stock_lots_ticket_id"),
    )
    for col in ["id", "ticket_id", "supplier_id", "stock_location_id", "product_id", "product_name", "ownership_status", "stock_status"]:
        op.create_index(op.f(f"ix_stock_lots_{col}"), "stock_lots", [col], unique=False)

    op.create_table(
        "stock_allocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stock_lot_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=True),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=True),
        sa.Column("allocated_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("status", stockallocationstatus, nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_lot_id"], ["stock_lots.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "stock_lot_id", "order_id", "order_item_id", "delivery_batch_id", "status"]:
        op.create_index(op.f(f"ix_stock_allocations_{col}"), "stock_allocations", [col], unique=False)

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stock_lot_id", sa.Integer(), nullable=False),
        sa.Column("movement_type", stockmovementtype, nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("from_location_id", sa.Integer(), nullable=True),
        sa.Column("to_location_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("delivery_batch_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["delivery_batch_id"], ["delivery_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["from_location_id"], ["stock_locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_lot_id"], ["stock_lots.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_location_id"], ["stock_locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ["id", "stock_lot_id", "movement_type", "from_location_id", "to_location_id", "order_id", "delivery_batch_id"]:
        op.create_index(op.f(f"ix_stock_movements_{col}"), "stock_movements", [col], unique=False)


def downgrade() -> None:
    for col in reversed(["id", "stock_lot_id", "movement_type", "from_location_id", "to_location_id", "order_id", "delivery_batch_id"]):
        op.drop_index(op.f(f"ix_stock_movements_{col}"), table_name="stock_movements")
    op.drop_table("stock_movements")
    for col in reversed(["id", "stock_lot_id", "order_id", "order_item_id", "delivery_batch_id", "status"]):
        op.drop_index(op.f(f"ix_stock_allocations_{col}"), table_name="stock_allocations")
    op.drop_table("stock_allocations")
    for col in reversed(["id", "ticket_id", "supplier_id", "stock_location_id", "product_id", "product_name", "ownership_status", "stock_status"]):
        op.drop_index(op.f(f"ix_stock_lots_{col}"), table_name="stock_lots")
    op.drop_table("stock_lots")
    for col in reversed(["id", "location_type", "supplier_id", "name", "region"]):
        op.drop_index(op.f(f"ix_stock_locations_{col}"), table_name="stock_locations")
    op.drop_table("stock_locations")
    for col in reversed(["id", "ticket_number", "ticket_date", "supplier_id", "supplier_name", "product_id", "product_name", "due_date", "status"]):
        op.drop_index(op.f(f"ix_exchange_tickets_{col}"), table_name="exchange_tickets")
    op.drop_table("exchange_tickets")
    stockmovementtype.drop(op.get_bind(), checkfirst=True)
    stockallocationstatus.drop(op.get_bind(), checkfirst=True)
    stockstatus.drop(op.get_bind(), checkfirst=True)
    ownershipstatus.drop(op.get_bind(), checkfirst=True)
    stocklocationtype.drop(op.get_bind(), checkfirst=True)
    exchangeticketstatus.drop(op.get_bind(), checkfirst=True)
