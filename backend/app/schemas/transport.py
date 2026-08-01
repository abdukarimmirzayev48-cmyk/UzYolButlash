from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.transport import TransportStatus


class TransportBase(BaseModel):
    carrier_name: str = Field(min_length=1, max_length=255)
    driver_name: str | None = None
    driver_phone: str | None = None
    vehicle_number: str = Field(min_length=1, max_length=64)
    trailer_number: str | None = None
    vehicle_type: str | None = None
    capacity: str | None = None
    status: TransportStatus = TransportStatus.active
    is_own: bool = False
    current_location: str | None = None
    notes: str | None = None


class TransportCreate(TransportBase):
    pass


class TransportUpdate(BaseModel):
    carrier_name: str | None = Field(default=None, min_length=1, max_length=255)
    driver_name: str | None = None
    driver_phone: str | None = None
    vehicle_number: str | None = Field(default=None, min_length=1, max_length=64)
    trailer_number: str | None = None
    vehicle_type: str | None = None
    capacity: str | None = None
    status: TransportStatus | None = None
    is_own: bool | None = None
    current_location: str | None = None
    notes: str | None = None


class TransportRead(TransportBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
