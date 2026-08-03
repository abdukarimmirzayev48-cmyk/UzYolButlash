from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.transport import FuelEntryType, TransportStatus


class TransportBase(BaseModel):
    driver_employee_id: int | None = None
    driver_phone: str | None = None
    vehicle_number: str = Field(min_length=1, max_length=64)
    trailer_number: str | None = None
    vehicle_type: str | None = None
    capacity: str | None = None
    status: TransportStatus = TransportStatus.active
    current_location: str | None = None
    notes: str | None = None


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


class TransportRead(TransportBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    driver_name: str | None = None
    created_at: datetime
    updated_at: datetime


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
