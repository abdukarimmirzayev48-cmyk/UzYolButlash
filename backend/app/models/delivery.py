from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.delivery_point import DeliveryPoint
from backend.app.models.client import TimestampMixin
from backend.app.models.transport import Transport


class BatchStatus(str, Enum):
    planned = "planned"
    supplier_preparing = "supplier_preparing"
    ready_for_loading = "ready_for_loading"
    waiting_payment = "waiting_payment"
    loading = "loading"
    loaded = "loaded"
    in_transit = "in_transit"
    arrived = "arrived"
    unloading = "unloading"
    accepted = "accepted"
    quantity_difference = "quantity_difference"
    documents_pending = "documents_pending"
    completed = "completed"
    cancelled = "cancelled"
    issue = "issue"


class AutoDeliveryMethod(str, Enum):
    auto = "auto"


class LogisticsStatus(str, Enum):
    not_assigned = "not_assigned"
    carrier_search = "carrier_search"
    carrier_assigned = "carrier_assigned"
    vehicle_assigned = "vehicle_assigned"
    loading = "loading"
    loaded = "loaded"
    in_transit = "in_transit"
    arrived = "arrived"
    unloading = "unloading"
    delivered = "delivered"
    accepted = "accepted"
    completed = "completed"
    cancelled = "cancelled"
    issue = "issue"


class TripCheckResult(str, Enum):
    not_checked = "not_checked"
    normal = "normal"
    needs_explanation = "needs_explanation"
    violation_confirmed = "violation_confirmed"


class PaidBy(str, Enum):
    company = "company"
    customer = "customer"
    supplier = "supplier"


class BatchDocumentType(str, Enum):
    ttn = "ttn"
    waybill = "waybill"
    acceptance_act = "acceptance_act"
    quality_certificate = "quality_certificate"
    supplier_invoice = "supplier_invoice"
    customer_invoice = "customer_invoice"
    photo = "photo"
    other = "other"


class LogisticsDocumentType(str, Enum):
    transport_invoice = "transport_invoice"
    waybill = "waybill"
    driver_document = "driver_document"
    vehicle_document = "vehicle_document"
    loading_photo = "loading_photo"
    delivery_photo = "delivery_photo"
    ttn = "ttn"
    other = "other"


class DeliveryBatch(Base, TimestampMixin):
    __tablename__ = "delivery_batches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), index=True)
    batch_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    batch_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    planned_loading_date: Mapped[date | None] = mapped_column(Date)
    planned_delivery_date: Mapped[date | None] = mapped_column(Date, index=True)
    actual_loading_date: Mapped[date | None] = mapped_column(Date)
    actual_delivery_date: Mapped[date | None] = mapped_column(Date)
    accepted_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[BatchStatus] = mapped_column(SAEnum(BatchStatus), default=BatchStatus.planned, nullable=False, index=True)
    fulfillment_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    delivery_method: Mapped[AutoDeliveryMethod] = mapped_column(SAEnum(AutoDeliveryMethod), default=AutoDeliveryMethod.auto, nullable=False)
    # Bitum qayerga yetkaziladi. Nuqta ma'lumotnomasidan tanlanadi va
    # manzil bu yerda qayta yozilmaydi.
    delivery_point_id: Mapped[int | None] = mapped_column(ForeignKey("delivery_points.id", ondelete="SET NULL"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(index=True)
    supplier_name: Mapped[str | None] = mapped_column(String(255), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))
    # Qabul farqi bo'yicha qaror. Farq o'zi hisoblanardi, lekin uni yopadigan
    # joy yo'q edi -- 2 tonna buyurtmada abadiy «yo'lda» bo'lib qolardi.
    difference_resolution: Mapped[str | None] = mapped_column(String(32), index=True)
    difference_note: Mapped[str | None] = mapped_column(Text)
    difference_resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    difference_resolved_by: Mapped[str | None] = mapped_column(String(255))

    delivery_point: Mapped["DeliveryPoint | None"] = relationship(lazy="selectin")
    client: Mapped["Client"] = relationship(back_populates="delivery_batches")
    contract: Mapped["Contract"] = relationship(back_populates="delivery_batches")
    order: Mapped["Order"] = relationship(back_populates="delivery_batches")
    items: Mapped[list["DeliveryBatchItem"]] = relationship(back_populates="batch", cascade="all, delete-orphan", order_by="DeliveryBatchItem.id")
    logistics: Mapped["Logistics | None"] = relationship(back_populates="batch", cascade="all, delete-orphan", uselist=False)
    documents: Mapped[list["DeliveryBatchDocument"]] = relationship(back_populates="batch", cascade="all, delete-orphan", order_by="DeliveryBatchDocument.uploaded_at.desc()")
    notes_history: Mapped[list["DeliveryBatchNote"]] = relationship(back_populates="batch", cascade="all, delete-orphan", order_by="DeliveryBatchNote.created_at.desc()")
    customer_invoices: Mapped[list["CustomerInvoice"]] = relationship(back_populates="delivery_batch")


class DeliveryBatchItem(Base, TimestampMixin):
    __tablename__ = "delivery_batch_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_batch_id: Mapped[int] = mapped_column(ForeignKey("delivery_batches.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"), index=True)
    contract_item_id: Mapped[int] = mapped_column(ForeignKey("contract_items.id", ondelete="RESTRICT"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    planned_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    loaded_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    accepted_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    difference_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    comment: Mapped[str | None] = mapped_column(Text)

    batch: Mapped[DeliveryBatch] = relationship(back_populates="items")
    order_item: Mapped["OrderItem"] = relationship(back_populates="delivery_batch_items")


class Logistics(Base, TimestampMixin):
    __tablename__ = "logistics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    delivery_batch_id: Mapped[int] = mapped_column(ForeignKey("delivery_batches.id", ondelete="CASCADE"), unique=True, index=True)
    logistics_number: Mapped[str | None] = mapped_column(String(128), unique=True, index=True)
    delivery_method: Mapped[AutoDeliveryMethod] = mapped_column(SAEnum(AutoDeliveryMethod), default=AutoDeliveryMethod.auto, nullable=False)
    status: Mapped[LogisticsStatus] = mapped_column(SAEnum(LogisticsStatus), default=LogisticsStatus.not_assigned, nullable=False, index=True)
    carrier_id: Mapped[int | None] = mapped_column(index=True)
    carrier_name: Mapped[str | None] = mapped_column(String(255), index=True)
    # Reys mashinaga bog'lanmagan edi: davlat raqami shunchaki matn bo'lib
    # yozilardi. Bazada bitta raqam uchta yozuvda takrorlangan va reyslardagi
    # raqamlardan biri parkda umuman yo'q -- shuning uchun «shu mashina
    # bo'yicha nechta reys» degan savolga javob berib bo'lmasdi. Matn
    # maydonlari qoldi, lekin ular endi bog'langan mashinadan to'ldiriladi.
    transport_id: Mapped[int | None] = mapped_column(ForeignKey("transports.id", ondelete="SET NULL"), index=True)
    driver_name: Mapped[str | None] = mapped_column(String(255), index=True)
    driver_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(64), index=True)
    trailer_number: Mapped[str | None] = mapped_column(String(64))
    loading_address: Mapped[str | None] = mapped_column(Text)
    delivery_address: Mapped[str | None] = mapped_column(Text)
    planned_pickup_date: Mapped[date | None] = mapped_column(Date)
    planned_delivery_date: Mapped[date | None] = mapped_column(Date, index=True)
    actual_pickup_date: Mapped[date | None] = mapped_column(Date)
    actual_delivery_date: Mapped[date | None] = mapped_column(Date)

    # Reys vaqt nuqtalari. Ilgari faqat to'rtta SANA bor edi, shuning uchun
    # «reys necha soat davom etdi», «necha soat kechikdi», «yuklash qancha
    # vaqt oldi» degan savollarning bittasi ham hisoblanmasdi. Sanalar
    # o'chirilmadi: ularga partiya holati va hisob-faktura bog'langan.
    # Aniq vaqt kiritilsa, sana shundan to'ldiriladi -- manba bitta bo'lsin.
    departed_at: Mapped[datetime | None] = mapped_column(DateTime)
    loading_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    loading_finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime)
    unloading_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    unloading_finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime)
    cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    customer_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    paid_by: Mapped[PaidBy | None] = mapped_column(SAEnum(PaidBy))
    route_name: Mapped[str | None] = mapped_column(String(255))
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    loaded_mileage_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    empty_mileage_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_consumption_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    # Yoqilg'i hisobi. `fuel_consumption_liters` ilgari ham bor edi, lekin u
    # qo'lda yozilardi va hech narsa bilan solishtirilmasdi -- ya'ni unga
    # istalgan raqamni yozish mumkin edi. Endi u boshidagi, quyilgan va
    # oxiridagi qoldiqdan hisoblanadi va mashina normasiga solishtiriladi.
    fuel_before_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_added_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_after_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # Masofa. Odometr ko'rsatkichi reysning ikki uchida olinadi; GPS masofasi
    # esa qo'lda kiritiladi -- trekerga ulanish yo'q, dispetcher uni
    # trekerning o'z panelidan ko'chirib yozadi. Ikkovining farqi o'zi
    # savol tug'diradi: odometr aylantirilgan bo'lishi mumkin.
    # Yuk nazorati. Bitum sovuydi, shuning uchun temperatura yuk hujjatining
    # bir qismi: sovib qolgan bitum bilan yo'l qoplamasi yotqizib bo'lmaydi va
    # buni ob'ektda emas, yuklashda bilish kerak. Plomba raqami ikki uchida
    # yoziladi -- ularning farqi yo'lda ochilgan degani.
    gross_weight_tons: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    tare_weight_tons: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    loading_seal: Mapped[str | None] = mapped_column(String(64))
    unloading_seal: Mapped[str | None] = mapped_column(String(64))
    loading_temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    unloading_temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))

    # Reys nazorati: kim ruxsat berdi, kim tekshirdi va nima qaror qilindi.
    approved_by: Mapped[str | None] = mapped_column(String(255))
    checked_by: Mapped[str | None] = mapped_column(String(255))
    check_result: Mapped[TripCheckResult] = mapped_column(
        SAEnum(TripCheckResult), default=TripCheckResult.not_checked, nullable=False, index=True
    )
    check_decision: Mapped[str | None] = mapped_column(Text)

    odometer_start_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    odometer_end_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    gps_distance_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    planned_distance_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    driver_wage_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    esp_tax_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=Decimal("12"))
    other_expenses_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    business_trip_expenses_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    batch: Mapped[DeliveryBatch] = relationship(back_populates="logistics")
    transport: Mapped["Transport | None"] = relationship()
    documents: Mapped[list["LogisticsDocument"]] = relationship(back_populates="logistics", cascade="all, delete-orphan", order_by="LogisticsDocument.uploaded_at.desc()")
    notes_history: Mapped[list["LogisticsNote"]] = relationship(back_populates="logistics", cascade="all, delete-orphan", order_by="LogisticsNote.created_at.desc()")
    customer_invoices: Mapped[list["CustomerInvoice"]] = relationship(back_populates="logistics")


class DeliveryBatchDocument(Base):
    __tablename__ = "delivery_batch_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_batch_id: Mapped[int] = mapped_column(ForeignKey("delivery_batches.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[BatchDocumentType] = mapped_column(SAEnum(BatchDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    batch: Mapped[DeliveryBatch] = relationship(back_populates="documents")


class DeliveryBatchNote(Base):
    __tablename__ = "delivery_batch_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_batch_id: Mapped[int] = mapped_column(ForeignKey("delivery_batches.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    batch: Mapped[DeliveryBatch] = relationship(back_populates="notes_history")


class LogisticsDocument(Base):
    __tablename__ = "logistics_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    logistics_id: Mapped[int] = mapped_column(ForeignKey("logistics.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[LogisticsDocumentType] = mapped_column(SAEnum(LogisticsDocumentType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    logistics: Mapped[Logistics] = relationship(back_populates="documents")


class LogisticsNote(Base):
    __tablename__ = "logistics_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    logistics_id: Mapped[int] = mapped_column(ForeignKey("logistics.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    logistics: Mapped[Logistics] = relationship(back_populates="notes_history")
