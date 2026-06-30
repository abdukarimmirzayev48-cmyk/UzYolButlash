from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class ContractStatus(str, Enum):
    draft = "draft"
    signed = "signed"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class TransportPaymentType(str, Enum):
    included = "included"
    separate_invoice = "separate_invoice"
    customer_pays_directly = "customer_pays_directly"


class DeliveryMethod(str, Enum):
    auto = "auto"
    railway = "railway"
    mixed = "mixed"


class ContractDocumentType(str, Enum):
    contract_pdf = "contract_pdf"
    specification = "specification"
    additional_agreement = "additional_agreement"
    invoice = "invoice"
    act = "act"
    other = "other"


class Contract(Base, TimestampMixin):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    contract_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    contract_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(ContractStatus), default=ContractStatus.draft, nullable=False, index=True
    )
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    client: Mapped["Client"] = relationship(back_populates="contracts")
    items: Mapped[list["ContractItem"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="ContractItem.id"
    )
    payment_terms: Mapped["ContractPaymentTerms | None"] = relationship(
        back_populates="contract", cascade="all, delete-orphan", uselist=False
    )
    transport_terms: Mapped["ContractTransportTerms | None"] = relationship(
        back_populates="contract", cascade="all, delete-orphan", uselist=False
    )
    documents: Mapped[list["ContractDocument"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="ContractDocument.uploaded_at.desc()"
    )
    notes_history: Mapped[list["ContractNote"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="ContractNote.created_at.desc()"
    )
    orders: Mapped[list["Order"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="Order.created_at.desc()"
    )
    delivery_batches: Mapped[list["DeliveryBatch"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="DeliveryBatch.created_at.desc()"
    )
    customer_invoices: Mapped[list["CustomerInvoice"]] = relationship(back_populates="contract")


class ContractItem(Base, TimestampMixin):
    __tablename__ = "contract_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_code: Mapped[str | None] = mapped_column(String(128))
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_with_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)

    contract: Mapped[Contract] = relationship(back_populates="items")
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="contract_item")


class ContractPaymentTerms(Base, TimestampMixin):
    __tablename__ = "contract_payment_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), unique=True, index=True)
    advance_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=30, nullable=False)
    advance_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    remaining_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=70, nullable=False)
    advance_due_days: Mapped[int] = mapped_column(default=10, nullable=False)
    batch_payment_due_days: Mapped[int] = mapped_column(default=3, nullable=False)
    remaining_payment_rule: Mapped[str] = mapped_column(
        Text,
        default="Payment of the remaining amount is made per ready delivery batch based on invoice.",
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    contract: Mapped[Contract] = relationship(back_populates="payment_terms")


class ContractTransportTerms(Base, TimestampMixin):
    __tablename__ = "contract_transport_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), unique=True, index=True)
    transport_payment_type: Mapped[TransportPaymentType] = mapped_column(
        SAEnum(TransportPaymentType), default=TransportPaymentType.separate_invoice, nullable=False
    )
    delivery_method: Mapped[DeliveryMethod] = mapped_column(
        SAEnum(DeliveryMethod), default=DeliveryMethod.mixed, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)

    contract: Mapped[Contract] = relationship(back_populates="transport_terms")


class ContractDocument(Base):
    __tablename__ = "contract_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[ContractDocumentType] = mapped_column(SAEnum(ContractDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    contract: Mapped[Contract] = relationship(back_populates="documents")


class ContractNote(Base):
    __tablename__ = "contract_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    contract: Mapped[Contract] = relationship(back_populates="notes_history")
