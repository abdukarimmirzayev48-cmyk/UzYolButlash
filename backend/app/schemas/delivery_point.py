from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.models.delivery_point import DeliveryPointStatus, DeliveryPointType

# Koordinata matn bo'lib saqlanadi, lekin u haqiqatan koordinata ekanini
# tekshirib qo'yish kerak: xatosi yo'lda, haydovchi qidirayotganda bilinadi.
LATITUDE_RANGE = (-90.0, 90.0)
LONGITUDE_RANGE = (-180.0, 180.0)

MSG_BAD_COORDINATE = "Koordinata noto'g'ri. Masalan: 41.311081"


class DeliveryPointBase(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str | None = Field(default=None, max_length=64)
    point_type: DeliveryPointType = DeliveryPointType.abz
    client_id: int | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None
    station_code: str | None = Field(default=None, max_length=16)
    latitude: str | None = Field(default=None, max_length=64)
    longitude: str | None = Field(default=None, max_length=64)
    responsible_name: str | None = None
    responsible_position: str | None = None
    responsible_phone: str | None = Field(default=None, max_length=64)
    responsible_email: str | None = None
    working_hours: str | None = Field(default=None, max_length=255)
    tank_capacity_tons: Decimal | None = Field(default=None, ge=0)
    daily_capacity_tons: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    status: DeliveryPointStatus = DeliveryPointStatus.active

    @field_validator("latitude")
    @classmethod
    def check_latitude(cls, value: str | None) -> str | None:
        return _check_coordinate(value, LATITUDE_RANGE)

    @field_validator("longitude")
    @classmethod
    def check_longitude(cls, value: str | None) -> str | None:
        return _check_coordinate(value, LONGITUDE_RANGE)


def _check_coordinate(value: str | None, bounds: tuple[float, float]) -> str | None:
    if value is None:
        return None
    text = value.strip().replace(",", ".")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError as error:
        raise ValueError(MSG_BAD_COORDINATE) from error
    if not bounds[0] <= number <= bounds[1]:
        raise ValueError(MSG_BAD_COORDINATE)
    return text


class DeliveryPointCreate(DeliveryPointBase):
    pass


class DeliveryPointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    code: str | None = Field(default=None, max_length=64)
    point_type: DeliveryPointType | None = None
    client_id: int | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None
    station_code: str | None = Field(default=None, max_length=16)
    latitude: str | None = Field(default=None, max_length=64)
    longitude: str | None = Field(default=None, max_length=64)
    responsible_name: str | None = None
    responsible_position: str | None = None
    responsible_phone: str | None = Field(default=None, max_length=64)
    responsible_email: str | None = None
    working_hours: str | None = Field(default=None, max_length=255)
    tank_capacity_tons: Decimal | None = Field(default=None, ge=0)
    daily_capacity_tons: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    status: DeliveryPointStatus | None = None

    @field_validator("latitude")
    @classmethod
    def check_latitude(cls, value: str | None) -> str | None:
        return _check_coordinate(value, LATITUDE_RANGE)

    @field_validator("longitude")
    @classmethod
    def check_longitude(cls, value: str | None) -> str | None:
        return _check_coordinate(value, LONGITUDE_RANGE)


class DeliveryPointClient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DeliveryPointRead(DeliveryPointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    client: DeliveryPointClient | None = None
    # Eski nom: nuqta tanlash mumkinligini bildiradi.
    is_active: bool = True
    # Saqlanmaydi: viloyat, tuman va manzildan yig'iladi. Ekranda va
    # yetkazish hujjatida bir xil ko'rinishi uchun bir joyda yig'iladi.
    full_address: str | None = None
    map_url: str | None = None


class DeliveryPointSummary(BaseModel):
    """Talabnoma, shartnoma, buyurtma va partiyada ko'rsatiladigan qisqa shakl."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region: str | None = None
    district: str | None = None
    address: str | None = None
    station_code: str | None = None
    full_address: str | None = None
    responsible_name: str | None = None
    responsible_phone: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    map_url: str | None = None


class DeliveryPointStatusShare(BaseModel):
    key: str
    label: str
    count: int = 0
    percent: Decimal = Decimal("0")


class DeliveryPointDashboard(BaseModel):
    total: int = 0
    total_delta: int = 0
    active: int = 0
    active_delta: int = 0
    attention: int = 0
    attention_delta: int = 0
    daily_capacity: Decimal = Decimal("0")
    capacity_added: Decimal = Decimal("0")
    by_status: list[DeliveryPointStatusShare] = Field(default_factory=list)
    with_coordinates: int = 0
    warnings: list[str] = Field(default_factory=list)


class DeliveryPointStatusUpdate(BaseModel):
    status: DeliveryPointStatus
    comment: str | None = None


class DeliveryPointHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    old_status: DeliveryPointStatus | None = None
    new_status: DeliveryPointStatus
    comment: str | None = None
    changed_by: str | None = None
    created_at: datetime
