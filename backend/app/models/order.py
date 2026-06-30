from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class OrderStatus(str, Enum):
    draft = "draft"
    created = "created"
    supplier_search = "supplier_search"
    supplier_selected = "supplier_selected"
    supplier_confirmed = "supplier_confirmed"
    waiting_payment = "waiting_payment"
    ready_for_delivery = "ready_for_delivery"
    in_delivery = "in_delivery"
    partially_delivered = "partially_delivered"
    delivered = "delivered"
    documents_pending = "documents_pending"
    closed = "closed"
    on_hold = "on_hold"
    cancelled = "cancelled"


class FulfillmentType(str, Enum):
    direct_supplier_to_customer = "direct_supplier_to_customer"
    company_managed_delivery = "company_managed_delivery"


class SourceType(str, Enum):
    russia_direct = "russia_direct"
    uzbekistan_local = "uzbekistan_local"
    jarkurgan = "jarkurgan"
    supplier_held_stock = "supplier_held_stock"
    other = "other"


class SupplierStatus(str, Enum):
    not_selected = "not_selected"
    searching = "searching"
    selected = "selected"
    confirmed = "confirmed"
    changed = "changed"


class OrderDocumentType(str, Enum):
    order_request = "order_request"
    supplier_offer = "supplier_offer"
    supplier_confirmation = "supplier_confirmation"
    internal_file = "internal_file"
    other = "other"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), index=True)
    order_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    required_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[OrderStatus] = mapped_column(SAEnum(OrderStatus), default=OrderStatus.draft, nullable=False, index=True)
    fulfillment_type: Mapped[FulfillmentType] = mapped_column(
        SAEnum(FulfillmentType), default=FulfillmentType.direct_supplier_to_customer, nullable=False, index=True
    )
    source_type: Mapped[SourceType] = mapped_column(SAEnum(SourceType), default=SourceType.other, nullable=False, index=True)
    supplier_id: Mapped[int | None] = mapped_column(index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), index=True)
    supplier_status: Mapped[SupplierStatus] = mapped_column(
        SAEnum(SupplierStatus), default=SupplierStatus.not_selected, nullable=False, index=True
    )
    supplier_notes: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    product_subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    markup_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    logistics_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    client: Mapped["Client"] = relationship(back_populates="orders")
    contract: Mapped["Contract"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    supplier_options: Mapped[list["OrderSupplierOption"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderSupplierOption.id"
    )
    documents: Mapped[list["OrderDocument"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderDocument.uploaded_at.desc()"
    )
    notes_history: Mapped[list["OrderNote"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderNote.created_at.desc()"
    )
    delivery_batches: Mapped[list["DeliveryBatch"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="DeliveryBatch.created_at.desc()"
    )
    customer_invoices: Mapped[list["CustomerInvoice"]] = relationship(back_populates="order")
    procurement: Mapped["Procurement | None"] = relationship(back_populates="order", uselist=False, cascade="all, delete-orphan")


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    contract_item_id: Mapped[int] = mapped_column(ForeignKey("contract_items.id", ondelete="RESTRICT"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_with_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    contract_item: Mapped["ContractItem"] = relationship(back_populates="order_items")
    delivery_batch_items: Mapped[list["DeliveryBatchItem"]] = relationship(back_populates="order_item")
    procurement_item: Mapped["ProcurementItem | None"] = relationship(back_populates="order_item", uselist=False)


class OrderSupplierOption(Base, TimestampMixin):
    __tablename__ = "order_supplier_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(index=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    offered_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    available_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    ready_date: Mapped[date | None] = mapped_column(Date)
    delivery_terms: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    order: Mapped[Order] = relationship(back_populates="supplier_options")


class OrderDocument(Base):
    __tablename__ = "order_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[OrderDocumentType] = mapped_column(SAEnum(OrderDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    order: Mapped[Order] = relationship(back_populates="documents")


class OrderNote(Base):
    __tablename__ = "order_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    order: Mapped[Order] = relationship(back_populates="notes_history")
