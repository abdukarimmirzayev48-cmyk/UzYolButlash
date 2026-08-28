from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.transport import (
    RepairCategory,
    RepairSeverity,
    RepairSource,
    RepairStatus,
    TransportCheckInKind,
    TransportEventCheckResult,
    TransportEventStatus,
    TransportEventType,
    TransportStatus,
)


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


class TransportEventVehicle(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_number: str
    driver_name: str | None = None


class RepairPartBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit: str | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)
    note: str | None = None


class RepairPartCreate(RepairPartBase):
    pass


class RepairPartRead(RepairPartBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    line_total: Decimal = Decimal("0")


class TransportRepairBase(BaseModel):
    transport_id: int
    opened_at: datetime
    breakdown_location: str | None = None
    source: RepairSource = RepairSource.driver
    category: RepairCategory = RepairCategory.other
    description: str | None = None
    severity: RepairSeverity = RepairSeverity.medium
    can_move: bool = True
    downtime_started_at: datetime | None = None
    downtime_finished_at: datetime | None = None
    repair_place: str | None = None
    work_done: str | None = None
    contractor: str | None = None
    act_number: str | None = None
    document_url: str | None = None
    odometer_km: Decimal | None = Field(default=None, ge=0)
    labour_cost: Decimal | None = Field(default=None, ge=0)
    responsible_name: str | None = None
    result: str | None = None
    delay_reason: str | None = None
    note: str | None = None
    created_by: str | None = None


class TransportRepairCreate(TransportRepairBase):
    # Raqamni server beradi.
    repair_number: str | None = None
    parts: list[RepairPartCreate] = Field(default_factory=list)


class TransportRepairUpdate(BaseModel):
    opened_at: datetime | None = None
    breakdown_location: str | None = None
    source: RepairSource | None = None
    category: RepairCategory | None = None
    description: str | None = None
    severity: RepairSeverity | None = None
    can_move: bool | None = None
    downtime_started_at: datetime | None = None
    downtime_finished_at: datetime | None = None
    repair_place: str | None = None
    work_done: str | None = None
    contractor: str | None = None
    act_number: str | None = None
    document_url: str | None = None
    odometer_km: Decimal | None = Field(default=None, ge=0)
    labour_cost: Decimal | None = Field(default=None, ge=0)
    responsible_name: str | None = None
    result: str | None = None
    delay_reason: str | None = None
    note: str | None = None
    parts: list[RepairPartCreate] | None = None


class TransportRepairStatusUpdate(BaseModel):
    status: RepairStatus
    comment: str | None = None


class TransportRepairRead(TransportRepairBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repair_number: str
    status: RepairStatus
    created_at: datetime
    updated_at: datetime
    parts: list[RepairPartRead] = Field(default_factory=list)
    transport: TransportEventVehicle | None = None
    # Saqlanmaydi, hisoblanadi.
    downtime_hours: Decimal | None = None
    parts_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    transitions: list[dict] = Field(default_factory=list)


class TransportRepairSummary(BaseModel):
    total: int = 0
    open_count: int = 0
    critical_open_count: int = 0
    immobilised_count: int = 0
    downtime_hours: Decimal = Decimal("0")
    parts_amount: Decimal = Decimal("0")
    labour_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
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
    repair_summary: TransportRepairSummary | None = None
    open_repairs: list[TransportRepairRead] = Field(default_factory=list)


class TransportEventBase(BaseModel):
    transport_id: int
    logistics_id: int | None = None
    occurred_at: datetime
    event_type: TransportEventType
    source: str | None = None
    location: str | None = None
    gps_coordinates: str | None = None
    odometer_km: Decimal | None = Field(default=None, ge=0)
    speed_kmh: Decimal | None = Field(default=None, ge=0)
    engine_running: bool | None = None
    fuel_before_liters: Decimal | None = Field(default=None, ge=0)
    fuel_after_liters: Decimal | None = Field(default=None, ge=0)
    amount_liters: Decimal | None = Field(default=None, ge=0)
    possible_loss_liters: Decimal | None = Field(default=None, ge=0)
    confirmed_consumption_liters: Decimal | None = Field(default=None, ge=0)
    cost_amount: Decimal | None = Field(default=None, ge=0)
    document_reference: str | None = None
    evidence_url: str | None = None
    is_approved: bool = False
    approved_by: str | None = None
    driver_explanation: str | None = None
    check_result: TransportEventCheckResult = TransportEventCheckResult.not_checked
    checked_by: str | None = None
    decision: str | None = None
    damage_amount: Decimal | None = Field(default=None, ge=0)
    status: TransportEventStatus = TransportEventStatus.open
    note: str | None = None
    created_by: str | None = None


class TransportEventCreate(TransportEventBase):
    # Raqamni server beradi -- brauzer bazani ko'rmagani uchun
    # takrorlanmasligini kafolatlay olmaydi.
    event_number: str | None = None


class TransportEventUpdate(BaseModel):
    logistics_id: int | None = None
    occurred_at: datetime | None = None
    event_type: TransportEventType | None = None
    source: str | None = None
    location: str | None = None
    gps_coordinates: str | None = None
    odometer_km: Decimal | None = Field(default=None, ge=0)
    speed_kmh: Decimal | None = Field(default=None, ge=0)
    engine_running: bool | None = None
    fuel_before_liters: Decimal | None = Field(default=None, ge=0)
    fuel_after_liters: Decimal | None = Field(default=None, ge=0)
    amount_liters: Decimal | None = Field(default=None, ge=0)
    possible_loss_liters: Decimal | None = Field(default=None, ge=0)
    confirmed_consumption_liters: Decimal | None = Field(default=None, ge=0)
    cost_amount: Decimal | None = Field(default=None, ge=0)
    document_reference: str | None = None
    evidence_url: str | None = None
    is_approved: bool | None = None
    approved_by: str | None = None
    driver_explanation: str | None = None
    check_result: TransportEventCheckResult | None = None
    checked_by: str | None = None
    decision: str | None = None
    damage_amount: Decimal | None = Field(default=None, ge=0)
    status: TransportEventStatus | None = None
    note: str | None = None


class TransportEventRead(TransportEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_number: str
    created_at: datetime
    updated_at: datetime
    transport: TransportEventVehicle | None = None
    logistics_number: str | None = None


class TransportEventSummary(BaseModel):
    total: int = 0
    open_count: int = 0
    not_checked_count: int = 0
    refuelled_liters: Decimal = Decimal("0")
    consumed_liters: Decimal = Decimal("0")
    balance_liters: Decimal = Decimal("0")
    total_cost_amount: Decimal = Decimal("0")
    possible_loss_liters: Decimal = Decimal("0")
    damage_amount: Decimal = Decimal("0")
    warnings: list[str] = Field(default_factory=list)


class FleetVehicleRow(BaseModel):
    transport_id: int
    vehicle_number: str
    driver_name: str | None = None
    status: str
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    norm_liters: Decimal = Decimal("0")
    difference_liters: Decimal = Decimal("0")
    difference_percent: Decimal | None = None
    suspected_liters: Decimal = Decimal("0")
    event_count: int = 0
    unchecked_event_count: int = 0
    damage_amount: Decimal = Decimal("0")
    repair_downtime_hours: Decimal = Decimal("0")
    repair_amount: Decimal = Decimal("0")
    open_repair_count: int = 0
    remaining_to_service_km: Decimal | None = None
    document_level: str = "unknown"
    warnings: list[str] = Field(default_factory=list)


class FleetTotals(BaseModel):
    vehicle_count: int = 0
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    norm_liters: Decimal = Decimal("0")
    difference_liters: Decimal = Decimal("0")
    suspected_liters: Decimal = Decimal("0")
    event_count: int = 0
    unchecked_event_count: int = 0
    damage_amount: Decimal = Decimal("0")
    repair_downtime_hours: Decimal = Decimal("0")
    repair_amount: Decimal = Decimal("0")
    unavailable_count: int = 0
    document_risk_count: int = 0


class FleetSummaryRead(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    totals: FleetTotals
    rows: list[FleetVehicleRow] = Field(default_factory=list)



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
