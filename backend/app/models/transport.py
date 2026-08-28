from datetime import date as date_cls, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text
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


class TransportEventType(str, Enum):
    """Hodisa turlari.

    «Quyildi» va «sarflandi» alohida yoqilg'i jurnalida edi. Hodisalar
    jurnali ham aynan shu narsani -- bakdagi o'zgarishni -- yozadi, ya'ni
    ikkita jadval bir voqeani ikki xil aytardi. Shuning uchun jurnal bitta:
    quyish ham, keskin tushish ham, kelishilmagan to'xtash ham bitta
    ro'yxatda turadi va har birining tekshiruv izi bor.
    """

    refuel = "refuel"
    consumption = "consumption"
    fuel_drop = "fuel_drop"
    suspected_siphoning = "suspected_siphoning"
    sensor_jump = "sensor_jump"
    idling = "idling"
    route_deviation = "route_deviation"
    unapproved_stop = "unapproved_stop"
    other = "other"


# Bak balansiga kiradigan turlar. Qolganlari -- tekshiruv yozuvi, ular
# yoqilg'i qoldig'ini o'zgartirmaydi.
FUEL_IN_TYPES = (TransportEventType.refuel,)
FUEL_OUT_TYPES = (TransportEventType.consumption,)


class TransportEventCheckResult(str, Enum):
    not_checked = "not_checked"
    normal = "normal"
    needs_explanation = "needs_explanation"
    violation_confirmed = "violation_confirmed"


class TransportEventStatus(str, Enum):
    open = "open"
    in_review = "in_review"
    closed = "closed"
    cancelled = "cancelled"


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
    events: Mapped[list["TransportEvent"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportEvent.occurred_at.desc(), TransportEvent.id.desc()")
    repairs: Mapped[list["TransportRepair"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportRepair.opened_at.desc(), TransportRepair.id.desc()")
    check_ins: Mapped[list["TransportCheckIn"]] = relationship(back_populates="transport", cascade="all, delete-orphan", order_by="TransportCheckIn.created_at.desc()")


class RepairCategory(str, Enum):
    engine = "engine"
    transmission = "transmission"
    chassis = "chassis"
    brakes = "brakes"
    electrics = "electrics"
    tyres = "tyres"
    tank = "tank"
    service = "service"
    other = "other"


# Rejali texnik xizmat. Bu turdagi ariza yopilganda mashina kartochkasidagi
# «oxirgi TO» yangilanadi, ya'ni keyingi TO o'zi siljiydi.
SERVICE_CATEGORIES = (RepairCategory.service,)


class RepairSeverity(str, Enum):
    low = "low"
    medium = "medium"
    critical = "critical"


class RepairStatus(str, Enum):
    new = "new"
    diagnosis = "diagnosis"
    waiting_parts = "waiting_parts"
    in_repair = "in_repair"
    done = "done"
    closed = "closed"
    cancelled = "cancelled"


# Shu holatlarda ariza hali ochiq: mashina ustida ish tugamagan.
CLOSED_REPAIR_STATUSES = (RepairStatus.closed, RepairStatus.cancelled)
OPEN_REPAIR_STATUSES = (
    RepairStatus.new,
    RepairStatus.diagnosis,
    RepairStatus.waiting_parts,
    RepairStatus.in_repair,
)


class RepairSource(str, Enum):
    driver = "driver"
    inspection = "inspection"
    dispatcher = "dispatcher"
    scheduled = "scheduled"
    other = "other"



class TransportEvent(Base, TimestampMixin):
    """Yoqilg'i va yo'l hodisalari jurnali.

    Har bir quyish, har bir keskin tushish, har bir kelishilmagan to'xtash --
    alohida yozuv. Muhimi hodisaning o'zi emas, uning izi: haydovchi nima
    dedi, kim tekshirdi, natija nima bo'ldi, qancha zarar undirildi. Shu
    izsiz hodisa ro'yxati oddiy raqamlar to'plami bo'lib qoladi.

    GPS koordinatasi, tezlik va dvigatel holati qo'lda kiritiladi --
    trekerga ulanish yo'q.
    """

    __tablename__ = "transport_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), index=True)
    logistics_id: Mapped[int | None] = mapped_column(ForeignKey("logistics.id", ondelete="SET NULL"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now, index=True)
    event_type: Mapped[TransportEventType] = mapped_column(SAEnum(TransportEventType), nullable=False, index=True)

    source: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    gps_coordinates: Mapped[str | None] = mapped_column(String(128))
    odometer_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    engine_running: Mapped[bool | None] = mapped_column(Boolean)

    fuel_before_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_after_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Quyilgan yoki sarflangan miqdor. Bak ko'rsatkichlari kiritilsa,
    # shulardan hisoblanadi; kiritilmasa, qo'lda yoziladi.
    amount_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    possible_loss_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    confirmed_consumption_liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    document_reference: Mapped[str | None] = mapped_column(String(255))
    evidence_url: Mapped[str | None] = mapped_column(String(500))
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(255))
    driver_explanation: Mapped[str | None] = mapped_column(Text)
    check_result: Mapped[TransportEventCheckResult] = mapped_column(
        SAEnum(TransportEventCheckResult), default=TransportEventCheckResult.not_checked, nullable=False, index=True
    )
    checked_by: Mapped[str | None] = mapped_column(String(255))
    decision: Mapped[str | None] = mapped_column(Text)
    damage_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    status: Mapped[TransportEventStatus] = mapped_column(
        SAEnum(TransportEventStatus), default=TransportEventStatus.open, nullable=False, index=True
    )
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    transport: Mapped[Transport] = relationship(back_populates="events")


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


class TransportRepair(Base, TimestampMixin):
    """Nosozlik, texnik xizmat va turib qolish arizasi.

    Bu bo'lim umuman yo'q edi: mashina ta'mirda ekanini faqat bitta bayroq
    aytardi. Nima buzilgani, qancha turib qolgani, qancha pul ketgani va kim
    tuzatgani hech qayerda yozilmasdi -- ya'ni bir xil nosozlik uchinchi
    marta takrorlanayotganini ham, bitta mashina yiliga qancha yeyayotganini
    ham bilib bo'lmasdi.

    Turib qolish vaqti alohida yoziladi va arizaning ochiq turgan vaqtidan
    farq qiladi: ariza ochiq bo'lishi, lekin mashina yurishi mumkin.
    """

    __tablename__ = "transport_repairs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    repair_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    transport_id: Mapped[int] = mapped_column(ForeignKey("transports.id", ondelete="CASCADE"), index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now, index=True)

    breakdown_location: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[RepairSource] = mapped_column(SAEnum(RepairSource), default=RepairSource.driver, nullable=False)
    category: Mapped[RepairCategory] = mapped_column(SAEnum(RepairCategory), default=RepairCategory.other, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[RepairSeverity] = mapped_column(SAEnum(RepairSeverity), default=RepairSeverity.medium, nullable=False, index=True)
    # Mashina yura oladimi. Yo'q bo'lsa, mashina holati «ta'mirda» ga o'tadi
    # va unga reys berib bo'lmaydi.
    can_move: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    downtime_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    downtime_finished_at: Mapped[datetime | None] = mapped_column(DateTime)

    repair_place: Mapped[str | None] = mapped_column(String(255))
    work_done: Mapped[str | None] = mapped_column(Text)
    contractor: Mapped[str | None] = mapped_column(String(255))
    act_number: Mapped[str | None] = mapped_column(String(128))
    document_url: Mapped[str | None] = mapped_column(String(500))
    odometer_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    # Ish haqi va boshqa xarajat. Ehtiyot qismlar alohida qatorlarda.
    labour_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))

    responsible_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[RepairStatus] = mapped_column(SAEnum(RepairStatus), default=RepairStatus.new, nullable=False, index=True)
    result: Mapped[str | None] = mapped_column(Text)
    delay_reason: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    transport: Mapped[Transport] = relationship(back_populates="repairs")
    parts: Mapped[list["TransportRepairPart"]] = relationship(back_populates="repair", cascade="all, delete-orphan", order_by="TransportRepairPart.id")


class TransportRepairPart(Base):
    """Ehtiyot qism yoki material.

    Excelda bitta qator uchun bitta qism maydoni bor edi. Amalda bitta
    ta'mirda bir nechta qism ketadi, va ularni bitta katakka yozib qo'yish
    xarajatni hisoblab bo'lmaydigan qilib qo'yadi.
    """

    __tablename__ = "transport_repair_parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    repair_id: Mapped[int] = mapped_column(ForeignKey("transport_repairs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("1"))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    note: Mapped[str | None] = mapped_column(Text)

    repair: Mapped[TransportRepair] = relationship(back_populates="parts")
