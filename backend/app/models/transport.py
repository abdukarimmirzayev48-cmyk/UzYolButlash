from datetime import date as date_cls, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.attendance import Employee
from backend.app.models.client import TimestampMixin


class TransportStatus(str, Enum):
    """Mashinaning parkdagi holati -- uni faqat odam biladi.

    Ilgari uchta qiymat bor edi: faol / faol emas / ta'mirda. Bitumovozlarni
    nazorat qiladigan jadvalda esa yettita: bo'sh, reysda, yuklashda, tushirishda,
    ta'mirda, TO da, bekor turibdi.

    Ulardan uchtasi -- reysda, yuklashda, slivda -- bu yerga yozilmaydi.
    Ularni logistika biladi va sahifa reysdan hisoblab ko'rsatadi. Qo'lda
    yoziladigan holat bilan reysdan chiqadigan holat ikkovi bir maydonni
    tortishtirsa, ekranda «bo'sh» deb turgan mashina ayni paytda reysda
    bo'lib chiqadi. Shuning uchun bu yerda faqat logistikadan chiqmaydigan
    holatlar qoladi.
    """

    free = "free"
    repair = "repair"
    service = "service"
    idle = "idle"
    inactive = "inactive"


# Bu holatlardagi mashinaga reys berib bo'lmaydi.
UNAVAILABLE_STATUSES = (TransportStatus.repair, TransportStatus.service, TransportStatus.inactive)


class FuelEntryType(str, Enum):
    added = "added"
    consumed = "consumed"


class TransportCheckInKind(str, Enum):
    report = "report"
    stopped = "stopped"
    resumed = "resumed"


class Transport(Base, TimestampMixin):
    __tablename__ = "transports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    driver_employee_id: Mapped[int | None] = mapped_column(ForeignKey("attendance_employees.id"), index=True)
    driver_name: Mapped[str | None] = mapped_column(String(255), index=True)
    driver_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    trailer_number: Mapped[str | None] = mapped_column(String(64), index=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(64), index=True)
    capacity: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[TransportStatus] = mapped_column(SAEnum(TransportStatus), default=TransportStatus.free, nullable=False, index=True)
    current_location: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    # Kartochka. `capacity` matn edi -- «27 tonna» -- va shu sababli yuk
    # sig'imga sig'adimi degan tekshiruvni qilib bo'lmasdi. Endi son ham bor;
    # eski matn maydoni o'chirilmadi, chunki unda «yarim tirkama» kabi
    # izohlar ham uchraydi.
    brand_model: Mapped[str | None] = mapped_column(String(128))
    production_year: Mapped[int | None] = mapped_column(Integer)
    base_location: Mapped[str | None] = mapped_column(String(255), index=True)
    capacity_tons: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    fuel_tank_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Yoqilg'i normasi bo'lmasa «norma bo'yicha sarf» ham, «ortiqcha sarf» ham,
    # «slivga shubha» ham hisoblanmaydi -- butun nazorat shu ikki sondan
    # boshlanadi.
    fuel_norm_loaded: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    fuel_norm_empty: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    tracker_id: Mapped[str | None] = mapped_column(String(128), index=True)

    # Texnik xizmat: oxirgisi qachon va qaysi kilometrda bo'lgan, oralig'i
    # qancha. Keyingisi shulardan hisoblanadi, alohida saqlanmaydi -- aks holda
    # oraliq o'zgarganda eski hisob qolib ketadi.
    service_interval_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    last_service_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    last_service_date: Mapped[date_cls | None] = mapped_column(Date)

    # Hujjat muddatlari.
    tech_inspection_until: Mapped[date_cls | None] = mapped_column(Date, index=True)
    insurance_until: Mapped[date_cls | None] = mapped_column(Date, index=True)
    adr_until: Mapped[date_cls | None] = mapped_column(Date, index=True)

    responsible_name: Mapped[str | None] = mapped_column(String(255))
    unavailable_reason: Mapped[str | None] = mapped_column(String(255))

    driver: Mapped[Employee | None] = relationship()
    fuel_logs: Mapped[list["TransportFuelLog"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportFuelLog.entry_date.desc(), TransportFuelLog.id.desc()")
    check_ins: Mapped[list["TransportCheckIn"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportCheckIn.created_at.desc()")


class TransportFuelLog(Base, TimestampMixin):
    __tablename__ = "transport_fuel_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), index=True)
    entry_date: Mapped[date_cls] = mapped_column(Date, nullable=False, default=date_cls.today, index=True)
    entry_type: Mapped[FuelEntryType] = mapped_column(SAEnum(FuelEntryType), nullable=False, index=True)
    amount_liters: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    transport: Mapped[Transport] = relationship(back_populates="fuel_logs")


class TransportCheckIn(Base):
    __tablename__ = "transport_checkins"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("attendance_employees.id"), nullable=False, index=True)
    logistics_id: Mapped[int | None] = mapped_column(ForeignKey("logistics.id"), index=True)
    kind: Mapped[TransportCheckInKind] = mapped_column(SAEnum(TransportCheckInKind), nullable=False, index=True)
    odometer_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    odometer_photo_url: Mapped[str | None] = mapped_column(String(500))
    fuel_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_photo_url: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)

    transport: Mapped[Transport] = relationship(back_populates="check_ins")
    employee: Mapped[Employee] = relationship()
