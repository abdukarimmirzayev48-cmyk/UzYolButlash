"""Ta'minotchilar ma'lumotnomasi: kontaktlar, manzillar, rekvizitlar."""

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, String, Text
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
