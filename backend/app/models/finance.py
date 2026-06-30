from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class InvoiceType(str, Enum):
    advance = "advance"
    batch_payment = "batch_payment"
    transport = "transport"
    adjustment = "adjustment"
    other = "other"


class InvoiceStatus(str, Enum):
    draft = "draft"
    issued = "issued"
    partially_paid = "partially_paid"
    paid = "paid"
    overdue = "overdue"
    cancelled = "cancelled"


class PaymentMethod(str, Enum):
    bank_transfer = "bank_transfer"
    cash = "cash"
    other = "other"


class PaymentStatus(str, Enum):
    received = "received"
    unallocated = "unallocated"
    partially_allocated = "partially_allocated"
    allocated = "allocated"
    cancelled = "cancelled"


class FinanceDocumentType(str, Enum):
    invoice_file = "invoice_file"
    payment_order = "payment_order"
    bank_statement = "bank_statement"
    reconciliation_act = "reconciliation_act"
    other = "other"


class CustomerInvoice(Base, TimestampMixin):
    __tablename__ = "customer_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    delivery_batch_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_batches.id", ondelete="SET NULL"), index=True)
    logistics_id: Mapped[int | None] = mapped_column(ForeignKey("logistics.id", ondelete="SET NULL"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    invoice_type: Mapped[InvoiceType] = mapped_column(SAEnum(InvoiceType), nullable=False, index=True)
    status: Mapped[InvoiceStatus] = mapped_column(SAEnum(InvoiceStatus), default=InvoiceStatus.draft, nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    remaining_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    client: Mapped["Client"] = relationship(back_populates="customer_invoices")
    contract: Mapped["Contract | None"] = relationship(back_populates="customer_invoices")
    order: Mapped["Order | None"] = relationship(back_populates="customer_invoices")
    delivery_batch: Mapped["DeliveryBatch | None"] = relationship(back_populates="customer_invoices")
    logistics: Mapped["Logistics | None"] = relationship(back_populates="customer_invoices")
    items: Mapped[list["CustomerInvoiceItem"]] = relationship(back_populates="invoice", cascade="all, delete-orphan", order_by="CustomerInvoiceItem.id")
    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    documents: Mapped[list["FinanceDocument"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    notes_history: Mapped[list["FinanceNote"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")


class CustomerInvoiceItem(Base, TimestampMixin):
    __tablename__ = "customer_invoice_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("customer_invoices.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    product_name: Mapped[str | None] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(64))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_with_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    invoice: Mapped[CustomerInvoice] = relationship(back_populates="items")


class CustomerPayment(Base, TimestampMixin):
    __tablename__ = "customer_payments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    payment_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod), nullable=False, index=True)
    bank_account: Mapped[str | None] = mapped_column(String(255), index=True)
    reference_number: Mapped[str | None] = mapped_column(String(255), index=True)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.received, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    client: Mapped["Client"] = relationship(back_populates="customer_payments")
    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment", cascade="all, delete-orphan")
    documents: Mapped[list["FinanceDocument"]] = relationship(back_populates="payment", cascade="all, delete-orphan")
    notes_history: Mapped[list["FinanceNote"]] = relationship(back_populates="payment", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("customer_payments.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("customer_invoices.id", ondelete="CASCADE"), index=True)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    payment: Mapped[CustomerPayment] = relationship(back_populates="allocations")
    invoice: Mapped[CustomerInvoice] = relationship(back_populates="allocations")


class FinanceDocument(Base):
    __tablename__ = "finance_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="SET NULL"), index=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("customer_invoices.id", ondelete="CASCADE"), index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("customer_payments.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[FinanceDocumentType] = mapped_column(SAEnum(FinanceDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    invoice: Mapped[CustomerInvoice | None] = relationship(back_populates="documents")
    payment: Mapped[CustomerPayment | None] = relationship(back_populates="documents")


class FinanceNote(Base):
    __tablename__ = "finance_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="SET NULL"), index=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("customer_invoices.id", ondelete="CASCADE"), index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("customer_payments.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    invoice: Mapped[CustomerInvoice | None] = relationship(back_populates="notes_history")
    payment: Mapped[CustomerPayment | None] = relationship(back_populates="notes_history")
