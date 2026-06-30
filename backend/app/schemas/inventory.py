from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.inventory import (
    ExchangeTicketStatus,
    OwnershipStatus,
    StockAllocationStatus,
    StockLocationType,
    StockMovementType,
    StockStatus,
)


class StockLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_type: StockLocationType
    supplier_id: int | None
    name: str
    address: str | None
    region: str | None
    district: str | None
    created_at: datetime
    updated_at: datetime


class ExchangeTicketBase(BaseModel):
    ticket_number: str = Field(min_length=1, max_length=128)
    ticket_date: date
    supplier_id: int
    product_id: int | None = None
    product_name: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=64)
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Field(default=Decimal("12"), ge=0)
    payment_term_days: int = Field(default=90, ge=0)
    notes: str | None = None
    created_by: str | None = None


class ExchangeTicketCreate(ExchangeTicketBase):
    open_immediately: bool = True


class ExchangeTicketUpdate(BaseModel):
    ticket_number: str | None = Field(default=None, min_length=1, max_length=128)
    ticket_date: date | None = None
    supplier_id: int | None = None
    product_id: int | None = None
    product_name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    quantity: Decimal | None = Field(default=None, gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0)
    payment_term_days: int | None = Field(default=None, ge=0)
    status: ExchangeTicketStatus | None = None
    notes: str | None = None
    created_by: str | None = None


class StockLotSummary(BaseModel):
    id: int
    ticket_id: int
    ticket_number: str | None = None
    supplier_id: int
    supplier_name: str | None = None
    stock_location_id: int
    location_name: str | None = None
    location_address: str | None = None
    product_id: int | None
    product_name: str
    unit: str
    quantity_initial: Decimal
    quantity_available: Decimal
    quantity_reserved: Decimal
    unit_cost: Decimal
    currency: str
    ownership_status: OwnershipStatus
    stock_status: StockStatus
    due_date: date | None = None
    created_at: datetime
    updated_at: datetime


class ExchangeTicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_number: str
    ticket_date: date
    supplier_id: int
    supplier_name: str
    product_id: int | None
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    subtotal_amount: Decimal
    vat_rate: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    payment_term_days: int
    due_date: date
    status: ExchangeTicketStatus
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    stock_lot: StockLotSummary | None = None


class StockAllocationCreate(BaseModel):
    stock_lot_id: int
    order_id: int
    order_item_id: int | None = None
    delivery_batch_id: int | None = None
    allocated_quantity: Decimal = Field(gt=0)
    created_by: str | None = None


class StockAllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stock_lot_id: int
    order_id: int
    order_item_id: int | None
    delivery_batch_id: int | None
    allocated_quantity: Decimal
    status: StockAllocationStatus
    created_at: datetime
    updated_at: datetime


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stock_lot_id: int
    movement_type: StockMovementType
    quantity: Decimal
    from_location_id: int | None
    to_location_id: int | None
    order_id: int | None
    delivery_batch_id: int | None
    notes: str | None
    created_at: datetime
    created_by: str | None


class StockLotDetail(StockLotSummary):
    allocations: list[StockAllocationRead] = Field(default_factory=list)
    movements: list[StockMovementRead] = Field(default_factory=list)
