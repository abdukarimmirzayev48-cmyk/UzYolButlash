from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.transport import FuelEntryType, TransportCheckInKind, TransportStatus


class TransportBase(BaseModel):
    driver_employee_id: int | None = None
    driver_phone: str | None = None
    vehicle_number: str = Field(min_length=1, max_length=64)
    trailer_number: str | None = None
    vehicle_type: str | None = None
    capacity: str | None = None
    status: TransportStatus = TransportStatus.free
    current_location: str | None = None
    notes: str | None = None
    brand_model: str | None = None
    production_year: int | None = None
    base_location: str | None = None
    capacity_tons: Decimal | None = None
    fuel_tank_liters: Decimal | None = None
    fuel_norm_loaded: Decimal | None = None
    fuel_norm_empty: Decimal | None = None
    tracker_id: str | None = None
    service_interval_km: Decimal | None = None
    last_service_km: Decimal | None = None
    last_service_date: date | None = None
    tech_inspection_until: date | None = None
    insurance_until: date | None = None
    adr_until: date | None = None
    responsible_name: str | None = None
    unavailable_reason: str | None = None


class TransportCreate(TransportBase):
    pass


class TransportUpdate(BaseModel):
    driver_employee_id: int | None = None
    driver_phone: str | None = None
    vehicle_number: str | None = Field(default=None, min_length=1, max_length=64)
    trailer_number: str | None = None
    vehicle_type: str | None = None
    capacity: str | None = None
    status: TransportStatus | None = None
    current_location: str | None = None
    notes: str | None = None
    brand_model: str | None = None
    production_year: int | None = None
    base_location: str | None = None
    capacity_tons: Decimal | None = None
    fuel_tank_liters: Decimal | None = None
    fuel_norm_loaded: Decimal | None = None
    fuel_norm_empty: Decimal | None = None
    tracker_id: str | None = None
    service_interval_km: Decimal | None = None
    last_service_km: Decimal | None = None
    last_service_date: date | None = None
    tech_inspection_until: date | None = None
    insurance_until: date | None = None
    adr_until: date | None = None
    responsible_name: str | None = None
    unavailable_reason: str | None = None


class TransportDocumentRow(BaseModel):
    key: str
    label: str
    until: date | None = None
    days_left: int | None = None
    level: str


class TransportServicePosition(BaseModel):
    interval_km: Decimal | None = None
    last_km: Decimal | None = None
    last_date: date | None = None
    next_km: Decimal | None = None
    current_km: Decimal | None = None
    remaining_km: Decimal | None = None
    level: str


class TransportReadiness(BaseModel):
    documents: list[TransportDocumentRow] = Field(default_factory=list)
    service: TransportServicePosition
    level: str
    warnings: list[str] = Field(default_factory=list)


class TransportUsage(BaseModel):
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    loaded_km: Decimal = Decimal("0")
    empty_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    norm_liters: Decimal | None = None
    fuel_difference_liters: Decimal | None = None
    liters_per_100km: Decimal | None = None
    last_trip_date: date | None = None
    warnings: list[str] = Field(default_factory=list)


class TransportTrip(BaseModel):
    id: int
    logistics_number: str | None = None
    batch_number: str | None = None
    client_name: str | None = None
    route_name: str | None = None
    status: str
    # `date` deb nomlansa, u shu sinf ichida `date` turini yopib qo'yadi.
    trip_date: date | None = None
    tons: Decimal | None = None
    distance_km: Decimal | None = None
    fuel_liters: Decimal | None = None
    total_hours: Decimal | None = None


class TransportRead(TransportBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    driver_name: str | None = None
    created_at: datetime
    updated_at: datetime
    # Saqlanmaydi, har o'qishda hisoblanadi -- shuning uchun oraliq yoki
    # odometr o'zgarganda eskirib qolmaydi.
    readiness: TransportReadiness | None = None
    # Reys mashinaga bog'langandan keyin hisoblanadigan xulosa.
    usage: TransportUsage | None = None
    trips: list[TransportTrip] = Field(default_factory=list)


class FuelLogBase(BaseModel):
    entry_date: date
    entry_type: FuelEntryType
    amount_liters: Decimal = Field(gt=0)
    cost_amount: Decimal | None = None
    note: str | None = None
    created_by: str | None = None


class FuelLogCreate(FuelLogBase):
    pass


class FuelLogUpdate(BaseModel):
    entry_date: date | None = None
    entry_type: FuelEntryType | None = None
    amount_liters: Decimal | None = Field(default=None, gt=0)
    cost_amount: Decimal | None = None
    note: str | None = None
    created_by: str | None = None


class FuelLogRead(FuelLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transport_id: int
    created_at: datetime
    updated_at: datetime


class FuelLogSummary(BaseModel):
    total_added_liters: Decimal
    total_consumed_liters: Decimal
    balance_liters: Decimal
    total_cost_amount: Decimal
    logs: list[FuelLogRead]


class TransportCheckInEmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class TransportCheckInRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transport_id: int
    logistics_id: int | None = None
    kind: TransportCheckInKind
    odometer_km: Decimal | None = None
    odometer_photo_url: str | None = None
    fuel_liters: Decimal | None = None
    fuel_photo_url: str | None = None
    note: str | None = None
    employee: TransportCheckInEmployeeSummary
    created_at: datetime
