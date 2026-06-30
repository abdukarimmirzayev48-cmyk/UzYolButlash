from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class SupplierInvoiceType(str, Enum):
    advance = "advance"
    product_purchase = "product_purchase"
    transport = "transport"
    adjustment = "adjustment"
    other = "other"


class SupplierInvoiceStatus(str, Enum):
    draft = "draft"
    received = "received"
    partially_paid = "partially_paid"
    paid = "paid"
    overdue = "overdue"
    cancelled = "cancelled"


class SupplierPaymentMethod(str, Enum):
    bank_transfer = "bank_transfer"
    cash = "cash"
    other = "other"


class SupplierPaymentStatus(str, Enum):
    paid = "paid"
    unallocated = "unallocated"
    partially_allocated = "partially_allocated"
    allocated = "allocated"
    cancelled = "cancelled"


class SupplierFinanceDocumentType(str, Enum):
    supplier_invoice_file = "supplier_invoice_file"
    payment_order = "payment_order"
    bank_statement = "bank_statement"
    reconciliation_act = "reconciliation_act"
    other = "other"


class SupplierInvoice(Base, TimestampMixin):
    __tablename__ = "supplier_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurements.id", ondelete="RESTRICT"), index=True)
    supplier_offer_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_offers.id", ondelete="SET NULL"), index=True)
    delivery_batch_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_batches.id", ondelete="SET NULL"), index=True)
    logistics_id: Mapped[int | None] = mapped_column(ForeignKey("logistics.id", ondelete="SET NULL"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    invoice_type: Mapped[SupplierInvoiceType] = mapped_column(SAEnum(SupplierInvoiceType), nullable=False, index=True)
    status: Mapped[SupplierInvoiceStatus] = mapped_column(
        SAEnum(SupplierInvoiceStatus), default=SupplierInvoiceStatus.draft, nullable=False, index=True
    )
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    remaining_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped["Supplier"] = relationship()
    procurement: Mapped["Procurement"] = relationship()
    supplier_offer: Mapped["SupplierOffer | None"] = relationship()
    delivery_batch: Mapped["DeliveryBatch | None"] = relationship()
    logistics: Mapped["Logistics | None"] = relationship()
    items: Mapped[list["SupplierInvoiceItem"]] = relationship(back_populates="invoice", cascade="all, delete-orphan", order_by="SupplierInvoiceItem.id")
    allocations: Mapped[list["SupplierPaymentAllocation"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    documents: Mapped[list["SupplierFinanceDocument"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    notes_history: Mapped[list["SupplierFinanceNote"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")


class SupplierInvoiceItem(Base, TimestampMixin):
    __tablename__ = "supplier_invoice_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_invoice_id: Mapped[int] = mapped_column(ForeignKey("supplier_invoices.id", ondelete="CASCADE"), index=True)
    procurement_item_id: Mapped[int | None] = mapped_column(ForeignKey("procurement_items.id", ondelete="SET NULL"), index=True)
    supplier_offer_item_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_offer_items.id", ondelete="SET NULL"), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    product_name: Mapped[str | None] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(64))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_with_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    invoice: Mapped[SupplierInvoice] = relationship(back_populates="items")
    procurement_item: Mapped["ProcurementItem | None"] = relationship()
    supplier_offer_item: Mapped["SupplierOfferItem | None"] = relationship()


class SupplierPayment(Base, TimestampMixin):
    __tablename__ = "supplier_payments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    payment_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    payment_method: Mapped[SupplierPaymentMethod] = mapped_column(SAEnum(SupplierPaymentMethod), nullable=False, index=True)
    bank_account: Mapped[str | None] = mapped_column(String(255), index=True)
    reference_number: Mapped[str | None] = mapped_column(String(255), index=True)
    status: Mapped[SupplierPaymentStatus] = mapped_column(
        SAEnum(SupplierPaymentStatus), default=SupplierPaymentStatus.paid, nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped["Supplier"] = relationship()
    allocations: Mapped[list["SupplierPaymentAllocation"]] = relationship(back_populates="payment", cascade="all, delete-orphan")
    documents: Mapped[list["SupplierFinanceDocument"]] = relationship(back_populates="payment", cascade="all, delete-orphan")
    notes_history: Mapped[list["SupplierFinanceNote"]] = relationship(back_populates="payment", cascade="all, delete-orphan")


class SupplierPaymentAllocation(Base):
    __tablename__ = "supplier_payment_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_payment_id: Mapped[int] = mapped_column(ForeignKey("supplier_payments.id", ondelete="CASCADE"), index=True)
    supplier_invoice_id: Mapped[int] = mapped_column(ForeignKey("supplier_invoices.id", ondelete="CASCADE"), index=True)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    payment: Mapped[SupplierPayment] = relationship(back_populates="allocations")
    invoice: Mapped[SupplierInvoice] = relationship(back_populates="allocations")


class SupplierFinanceDocument(Base):
    __tablename__ = "supplier_finance_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    procurement_id: Mapped[int | None] = mapped_column(ForeignKey("procurements.id", ondelete="SET NULL"), index=True)
    supplier_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_invoices.id", ondelete="CASCADE"), index=True)
    supplier_payment_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_payments.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[SupplierFinanceDocumentType] = mapped_column(SAEnum(SupplierFinanceDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    invoice: Mapped[SupplierInvoice | None] = relationship(back_populates="documents")
    payment: Mapped[SupplierPayment | None] = relationship(back_populates="documents")


class SupplierFinanceNote(Base):
    __tablename__ = "supplier_finance_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    procurement_id: Mapped[int | None] = mapped_column(ForeignKey("procurements.id", ondelete="SET NULL"), index=True)
    supplier_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_invoices.id", ondelete="CASCADE"), index=True)
    supplier_payment_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_payments.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    invoice: Mapped[SupplierInvoice | None] = relationship(back_populates="notes_history")
    payment: Mapped[SupplierPayment | None] = relationship(back_populates="notes_history")
