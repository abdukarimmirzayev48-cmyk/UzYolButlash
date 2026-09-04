from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.contract import DeliveryMethod
from backend.app.models.delivery_point import DeliveryPoint
from backend.app.models.client import TimestampMixin


class CustomerType(str, Enum):
    internal_organization = "internal_organization"
    external_customer = "external_customer"


class PaymentSource(str, Enum):
    treasury = "treasury"
    bank = "bank"


class CustomerRequestStatus(str, Enum):
    new = "new"
    # Ko'rib chiqish va muzokara bitta holat: amalda ular bir vaqtda ketadi
    # va operator qaysi biridaligini ajrata olmasdi -- natijada tugma
    # tasodifan bosilardi va tarix ma'nosini yo'qotardi.
    reviewing = "reviewing"
    contract_preparation = "contract_preparation"
    contract_signed = "contract_signed"
    converted_to_order = "converted_to_order"
    rejected = "rejected"


class CompanyRegistry(Base, TimestampMixin):
    __tablename__ = "company_registry"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    inn: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    region: Mapped[str | None] = mapped_column(String(255), index=True)
    activity_type: Mapped[str | None] = mapped_column(Text)
    function_description: Mapped[str | None] = mapped_column(Text)
    privatization_project_name: Mapped[str | None] = mapped_column(String(255))
    oked: Mapped[str | None] = mapped_column(String(32))
    director_full_name: Mapped[str | None] = mapped_column(String(255))
    legal_address: Mapped[str | None] = mapped_column(Text)
    bank_account: Mapped[str | None] = mapped_column(String(64))
    bank_name: Mapped[str | None] = mapped_column(String(255))
    mfo: Mapped[str | None] = mapped_column(String(32))
    phone: Mapped[str | None] = mapped_column(String(64))


class CustomerRequest(Base, TimestampMixin):
    __tablename__ = "customer_requests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    request_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    customer_type: Mapped[CustomerType] = mapped_column(SAEnum(CustomerType), nullable=False, index=True)
    payment_source: Mapped[PaymentSource] = mapped_column(SAEnum(PaymentSource), nullable=False, index=True)
    # Ichkaridan kiritilgan talabnomada korxona mijozlar ro'yxatidan
    # tanlanadi va qolgan maydonlar uning kartochkasidan to'ldiriladi.
    # Ochiq portaldan kelgan talabnomada mijoz hali ro'yxatda bo'lmasligi
    # mumkin -- shuning uchun bog'lanish majburiy emas.
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    # Bitum qayerga yetkaziladi. Manzil talabnomada qayta yozilmaydi.
    delivery_point_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_points.id", ondelete="SET NULL"), index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str | None] = mapped_column(String(32), index=True)
    region: Mapped[str | None] = mapped_column(String(255), index=True)
    activity_type: Mapped[str | None] = mapped_column(Text)
    function_description: Mapped[str | None] = mapped_column(Text)
    privatization_project_name: Mapped[str | None] = mapped_column(String(255))
    # Talabnomada usul ATAYLAB tanlanadi: mahsulotdan sukut qiymat keladi,
    # lekin xodim uni o'zgartira oladi. Shu tanlov yetkazish nuqtalari
    # ro'yxatini belgilaydi -- temiryo'lda stansiyalar, avtoda ABZ.
    delivery_method: Mapped[DeliveryMethod | None] = mapped_column(SAEnum(DeliveryMethod, length=16))
    oked: Mapped[str | None] = mapped_column(String(32))
    director_full_name: Mapped[str | None] = mapped_column(String(255))
    legal_address: Mapped[str | None] = mapped_column(Text)
    bank_account: Mapped[str | None] = mapped_column(String(64))
    bank_name: Mapped[str | None] = mapped_column(String(255))
    mfo: Mapped[str | None] = mapped_column(String(32))
    phone: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    contact_full_name: Mapped[str | None] = mapped_column(String(255), index=True)
    contact_phone: Mapped[str | None] = mapped_column(String(64))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    total_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[CustomerRequestStatus] = mapped_column(
        SAEnum(CustomerRequestStatus), nullable=False, default=CustomerRequestStatus.new, index=True
    )
    internal_comment: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    contract_signed_at: Mapped[datetime | None] = mapped_column(DateTime)
    converted_to_order_at: Mapped[datetime | None] = mapped_column(DateTime)

    delivery_point: Mapped["DeliveryPoint | None"] = relationship(lazy="selectin")
    product: Mapped["Product"] = relationship()
    schedules: Mapped[list["CustomerRequestSchedule"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="CustomerRequestSchedule.id"
    )
    documents: Mapped[list["CustomerRequestDocument"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="CustomerRequestDocument.uploaded_at.desc()"
    )
    status_history: Mapped[list["CustomerRequestStatusHistory"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="CustomerRequestStatusHistory.created_at.desc()"
    )


class CustomerRequestSchedule(Base, TimestampMixin):
    __tablename__ = "customer_request_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("customer_requests.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)

    request: Mapped[CustomerRequest] = relationship(back_populates="schedules")


class CustomerRequestStatusHistory(Base):
    __tablename__ = "customer_request_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("customer_requests.id", ondelete="CASCADE"), index=True)
    old_status: Mapped[CustomerRequestStatus | None] = mapped_column(SAEnum(CustomerRequestStatus), nullable=True)
    new_status: Mapped[CustomerRequestStatus] = mapped_column(SAEnum(CustomerRequestStatus), nullable=False, index=True)
    changed_by: Mapped[str | None] = mapped_column(String(255))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    request: Mapped[CustomerRequest] = relationship(back_populates="status_history")


class CustomerRequestDocumentType(str, Enum):
    # Mijozning rasmiy xati -- shartnoma tayyorlashga o'tish uchun asos.
    letter = "letter"
    specification = "specification"
    other = "other"


# Shartnoma tayyorlashga o'tish uchun aynan shu tur talab qilinadi.
REQUIRED_FOR_CONTRACT = CustomerRequestDocumentType.letter


class CustomerRequestDocument(Base):
    __tablename__ = "customer_request_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("customer_requests.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[CustomerRequestDocumentType] = mapped_column(
        SAEnum(CustomerRequestDocumentType), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    request: Mapped["CustomerRequest"] = relationship(back_populates="documents")
