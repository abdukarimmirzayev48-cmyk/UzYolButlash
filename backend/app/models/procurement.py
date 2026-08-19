from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class SupplierAddressType(str, Enum):
    legal = "legal"
    loading = "loading"
    warehouse = "warehouse"
    factory = "factory"
    other = "other"


class SupplierDocumentType(str, Enum):
    requisites = "requisites"
    certificate = "certificate"
    license = "license"
    company_card = "company_card"
    contract = "contract"
    other = "other"


class ProcurementStatus(str, Enum):
    draft = "draft"
    supplier_search = "supplier_search"
    offers_received = "offers_received"
    supplier_selected = "supplier_selected"
    supplier_confirmed = "supplier_confirmed"
    purchase_approved = "purchase_approved"
    waiting_supplier_ready = "waiting_supplier_ready"
    ready_for_pickup = "ready_for_pickup"
    ready_for_delivery = "ready_for_delivery"
    completed = "completed"
    cancelled = "cancelled"
    issue = "issue"


class SupplierOfferStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    received = "received"
    selected = "selected"
    partially_selected = "partially_selected"
    rejected = "rejected"
    expired = "expired"
    cancelled = "cancelled"


class ProcurementDocumentType(str, Enum):
    supplier_offer = "supplier_offer"
    supplier_confirmation = "supplier_confirmation"
    purchase_agreement = "purchase_agreement"
    invoice_file = "invoice_file"
    quality_certificate = "quality_certificate"
    other = "other"


class Supplier(Base, TimestampMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str | None] = mapped_column(String(32), index=True)
    oked: Mapped[str | None] = mapped_column(String(32))
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    contacts: Mapped[list["SupplierContact"]] = relationship(back_populates="supplier", cascade="all, delete-orphan", order_by="SupplierContact.id")
    addresses: Mapped[list["SupplierAddress"]] = relationship(back_populates="supplier", cascade="all, delete-orphan", order_by="SupplierAddress.id")
    bank_accounts: Mapped[list["SupplierBankAccount"]] = relationship(back_populates="supplier", cascade="all, delete-orphan", order_by="SupplierBankAccount.id")
    documents: Mapped[list["SupplierDocument"]] = relationship(back_populates="supplier", cascade="all, delete-orphan", order_by="SupplierDocument.uploaded_at.desc()")
    notes_history: Mapped[list["SupplierNote"]] = relationship(back_populates="supplier", cascade="all, delete-orphan", order_by="SupplierNote.created_at.desc()")
    offers: Mapped[list["SupplierOffer"]] = relationship(back_populates="supplier")


class SupplierContact(Base, TimestampMixin):
    __tablename__ = "supplier_contacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    supplier: Mapped[Supplier] = relationship(back_populates="contacts")


class SupplierAddress(Base, TimestampMixin):
    __tablename__ = "supplier_addresses"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    address_type: Mapped[SupplierAddressType] = mapped_column(SAEnum(SupplierAddressType), nullable=False, index=True)
    region: Mapped[str | None] = mapped_column(String(255), index=True)
    district: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[str | None] = mapped_column(String(64))
    longitude: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(Text)
    supplier: Mapped[Supplier] = relationship(back_populates="addresses")


class SupplierBankAccount(Base, TimestampMixin):
    __tablename__ = "supplier_bank_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mfo: Mapped[str | None] = mapped_column(String(32))
    account_number: Mapped[str | None] = mapped_column(String(64))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    supplier: Mapped[Supplier] = relationship(back_populates="bank_accounts")


class SupplierDocument(Base):
    __tablename__ = "supplier_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[SupplierDocumentType] = mapped_column(SAEnum(SupplierDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    supplier: Mapped[Supplier] = relationship(back_populates="documents")


class SupplierNote(Base):
    __tablename__ = "supplier_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    supplier: Mapped[Supplier] = relationship(back_populates="notes_history")


class Procurement(Base, TimestampMixin):
    __tablename__ = "procurements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    procurement_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    procurement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    required_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[ProcurementStatus] = mapped_column(SAEnum(ProcurementStatus), default=ProcurementStatus.draft, nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    fulfillment_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    estimated_purchase_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    final_purchase_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    order: Mapped["Order"] = relationship(back_populates="procurement")
    contract: Mapped["Contract"] = relationship()
    client: Mapped["Client"] = relationship()
    items: Mapped[list["ProcurementItem"]] = relationship(back_populates="procurement", cascade="all, delete-orphan", order_by="ProcurementItem.id")
    offers: Mapped[list["SupplierOffer"]] = relationship(back_populates="procurement", cascade="all, delete-orphan", order_by="SupplierOffer.id")
    documents: Mapped[list["ProcurementDocument"]] = relationship(back_populates="procurement", cascade="all, delete-orphan", order_by="ProcurementDocument.uploaded_at.desc()")
    notes_history: Mapped[list["ProcurementNote"]] = relationship(back_populates="procurement", cascade="all, delete-orphan", order_by="ProcurementNote.created_at.desc()")


class ProcurementItem(Base, TimestampMixin):
    __tablename__ = "procurement_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurements.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"), index=True)
    contract_item_id: Mapped[int] = mapped_column(ForeignKey("contract_items.id", ondelete="RESTRICT"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    required_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    purchased_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, nullable=False)
    procurement: Mapped[Procurement] = relationship(back_populates="items")
    order_item: Mapped["OrderItem"] = relationship(back_populates="procurement_item")
    offer_items: Mapped[list["SupplierOfferItem"]] = relationship(back_populates="procurement_item")


class SupplierOffer(Base, TimestampMixin):
    __tablename__ = "supplier_offers"
    id: Mapped[int] = mapped_column(primary_key=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurements.id", ondelete="CASCADE"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"), index=True)
    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    offer_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    offer_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    status: Mapped[SupplierOfferStatus] = mapped_column(SAEnum(SupplierOfferStatus), default=SupplierOfferStatus.draft, nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    total_product_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    transport_included: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivery_terms: Mapped[str | None] = mapped_column(Text)
    estimated_delivery_cost: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    ready_date: Mapped[date | None] = mapped_column(Date)
    payment_terms: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    procurement: Mapped[Procurement] = relationship(back_populates="offers")
    supplier: Mapped[Supplier | None] = relationship(back_populates="offers")
    items: Mapped[list["SupplierOfferItem"]] = relationship(back_populates="offer", cascade="all, delete-orphan", order_by="SupplierOfferItem.id")


class SupplierOfferItem(Base, TimestampMixin):
    __tablename__ = "supplier_offer_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_offer_id: Mapped[int] = mapped_column(ForeignKey("supplier_offers.id", ondelete="CASCADE"), index=True)
    procurement_item_id: Mapped[int] = mapped_column(ForeignKey("procurement_items.id", ondelete="RESTRICT"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"), index=True)
    contract_item_id: Mapped[int] = mapped_column(ForeignKey("contract_items.id", ondelete="RESTRICT"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    offered_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    selected_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=0, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=12, nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    total_with_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    transport_included: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivery_terms: Mapped[str | None] = mapped_column(Text)
    ready_date: Mapped[date | None] = mapped_column(Date)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    offer: Mapped[SupplierOffer] = relationship(back_populates="items")
    procurement_item: Mapped[ProcurementItem] = relationship(back_populates="offer_items")
    order_item: Mapped["OrderItem"] = relationship()


class ProcurementDocument(Base):
    __tablename__ = "procurement_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurements.id", ondelete="CASCADE"), index=True)
    supplier_offer_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_offers.id", ondelete="SET NULL"), index=True)
    document_type: Mapped[ProcurementDocumentType] = mapped_column(SAEnum(ProcurementDocumentType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    procurement: Mapped[Procurement] = relationship(back_populates="documents")


class ProcurementNote(Base):
    __tablename__ = "procurement_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurements.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    procurement: Mapped[Procurement] = relationship(back_populates="notes_history")
