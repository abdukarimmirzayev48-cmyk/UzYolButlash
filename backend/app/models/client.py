from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base


class AddressType(str, Enum):
    legal = "legal"
    delivery = "delivery"
    railway_station = "railway_station"
    warehouse = "warehouse"


class DocumentType(str, Enum):
    requisites = "requisites"
    certificate = "certificate"
    power_of_attorney = "power_of_attorney"
    company_card = "company_card"
    other = "other"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now, nullable=False
    )


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str | None] = mapped_column(String(32), index=True)
    oked: Mapped[str | None] = mapped_column(String(32))
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    contacts: Mapped[list["ClientContact"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientContact.id"
    )
    addresses: Mapped[list["ClientAddress"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientAddress.id"
    )
    bank_accounts: Mapped[list["ClientBankAccount"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientBankAccount.id"
    )
    documents: Mapped[list["ClientDocument"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientDocument.id"
    )
    notes_history: Mapped[list["ClientNote"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientNote.created_at.desc()"
    )
    contracts: Mapped[list["Contract"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="Contract.created_at.desc()"
    )
    orders: Mapped[list["Order"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="Order.created_at.desc()"
    )
    delivery_batches: Mapped[list["DeliveryBatch"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="DeliveryBatch.created_at.desc()"
    )
    customer_invoices: Mapped[list["CustomerInvoice"]] = relationship(back_populates="client")
    customer_payments: Mapped[list["CustomerPayment"]] = relationship(back_populates="client")


class ClientContact(Base, TimestampMixin):
    __tablename__ = "client_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    client: Mapped[Client] = relationship(back_populates="contacts")


class ClientAddress(Base, TimestampMixin):
    __tablename__ = "client_addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    address_type: Mapped[AddressType] = mapped_column(SAEnum(AddressType), nullable=False, index=True)
    region: Mapped[str | None] = mapped_column(String(255), index=True)
    district: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[str | None] = mapped_column(String(64))
    longitude: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(Text)

    client: Mapped[Client] = relationship(back_populates="addresses")


class ClientBankAccount(Base, TimestampMixin):
    __tablename__ = "client_bank_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mfo: Mapped[str | None] = mapped_column(String(32))
    account_number: Mapped[str | None] = mapped_column(String(64))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    client: Mapped[Client] = relationship(back_populates="bank_accounts")


class ClientDocument(Base):
    __tablename__ = "client_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[DocumentType] = mapped_column(SAEnum(DocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    client: Mapped[Client] = relationship(back_populates="documents")


class ClientNote(Base):
    __tablename__ = "client_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    client: Mapped[Client] = relationship(back_populates="notes_history")
