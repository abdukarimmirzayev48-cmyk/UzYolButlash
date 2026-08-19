from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class ExchangeTicketStatus(str, Enum):
    draft = "draft"
    opened = "opened"
    partially_paid = "partially_paid"
    paid = "paid"
    overdue = "overdue"
    closed = "closed"
    cancelled = "cancelled"


class StockLocationType(str, Enum):
    supplier_storage = "supplier_storage"
    company_warehouse = "company_warehouse"
    in_transit = "in_transit"
    customer_site = "customer_site"
    other = "other"


class OwnershipStatus(str, Enum):
    owned_by_company = "owned_by_company"


class StockStatus(str, Enum):
    available = "available"
    reserved = "reserved"
    partially_used = "partially_used"
    used = "used"
    blocked = "blocked"
    cancelled = "cancelled"


class StockAllocationStatus(str, Enum):
    reserved = "reserved"
    released = "released"
    picked_up = "picked_up"
    delivered = "delivered"
    cancelled = "cancelled"


class StockMovementType(str, Enum):
    purchase_in = "purchase_in"
    reserve = "reserve"
    release_reserve = "release_reserve"
    pickup = "pickup"
    in_transit = "in_transit"
    delivered = "delivered"
    adjustment = "adjustment"


class ExchangeTicketPaymentType(str, Enum):
    """Spot settles within days; forward is the deferred birja term."""

    spot = "spot"
    forward = "forward"


class ExchangeTicket(Base, TimestampMixin):
    __tablename__ = "exchange_tickets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ticket_number: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    ticket_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    payment_type: Mapped[ExchangeTicketPaymentType] = mapped_column(
        SAEnum(ExchangeTicketPaymentType), default=ExchangeTicketPaymentType.forward, nullable=False, index=True
    )
    payment_term_days: Mapped[int] = mapped_column(default=90, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[ExchangeTicketStatus] = mapped_column(
        SAEnum(ExchangeTicketStatus), default=ExchangeTicketStatus.draft, nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped["Supplier"] = relationship()
    stock_lot: Mapped["StockLot | None"] = relationship(back_populates="ticket", uselist=False)


class StockLocation(Base, TimestampMixin):
    __tablename__ = "stock_locations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    location_type: Mapped[StockLocationType] = mapped_column(SAEnum(StockLocationType), nullable=False, index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(String(255), index=True)
    district: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped["Supplier | None"] = relationship()
    stock_lots: Mapped[list["StockLot"]] = relationship(back_populates="stock_location")


class StockLot(Base, TimestampMixin):
    __tablename__ = "stock_lots"
    __table_args__ = (UniqueConstraint("ticket_id", name="uq_stock_lots_ticket_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("exchange_tickets.id", ondelete="RESTRICT"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    stock_location_id: Mapped[int] = mapped_column(ForeignKey("stock_locations.id", ondelete="RESTRICT"), index=True)
    product_id: Mapped[int | None] = mapped_column(index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity_initial: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    quantity_available: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    quantity_reserved: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    ownership_status: Mapped[OwnershipStatus] = mapped_column(
        SAEnum(OwnershipStatus), default=OwnershipStatus.owned_by_company, nullable=False, index=True
    )
    stock_status: Mapped[StockStatus] = mapped_column(SAEnum(StockStatus), default=StockStatus.available, nullable=False, index=True)

    ticket: Mapped[ExchangeTicket] = relationship(back_populates="stock_lot")
    supplier: Mapped["Supplier"] = relationship()
    stock_location: Mapped[StockLocation] = relationship(back_populates="stock_lots")
    allocations: Mapped[list["StockAllocation"]] = relationship(back_populates="stock_lot", cascade="all, delete-orphan")
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="stock_lot", cascade="all, delete-orphan")


class StockAllocation(Base, TimestampMixin):
    __tablename__ = "stock_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    stock_lot_id: Mapped[int] = mapped_column(ForeignKey("stock_lots.id", ondelete="RESTRICT"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), index=True)
    delivery_batch_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_batches.id", ondelete="SET NULL"), index=True)
    allocated_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    status: Mapped[StockAllocationStatus] = mapped_column(
        SAEnum(StockAllocationStatus), default=StockAllocationStatus.reserved, nullable=False, index=True
    )

    stock_lot: Mapped[StockLot] = relationship(back_populates="allocations")
    order: Mapped["Order"] = relationship()
    order_item: Mapped["OrderItem | None"] = relationship()
    delivery_batch: Mapped["DeliveryBatch | None"] = relationship()


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    stock_lot_id: Mapped[int] = mapped_column(ForeignKey("stock_lots.id", ondelete="RESTRICT"), index=True)
    movement_type: Mapped[StockMovementType] = mapped_column(SAEnum(StockMovementType), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    from_location_id: Mapped[int | None] = mapped_column(ForeignKey("stock_locations.id", ondelete="SET NULL"), index=True)
    to_location_id: Mapped[int | None] = mapped_column(ForeignKey("stock_locations.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    delivery_batch_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_batches.id", ondelete="SET NULL"), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))

    stock_lot: Mapped[StockLot] = relationship(back_populates="movements")
    from_location: Mapped[StockLocation | None] = relationship(foreign_keys=[from_location_id])
    to_location: Mapped[StockLocation | None] = relationship(foreign_keys=[to_location_id])
