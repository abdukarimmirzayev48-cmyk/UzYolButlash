from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.delivery import (
    AutoDeliveryMethod,
    BatchDocumentType,
    BatchStatus,
    LogisticsDocumentType,
    LogisticsStatus,
    PaidBy,
)
from backend.app.schemas.client import ClientRead
from backend.app.schemas.contract import ContractRead
from backend.app.schemas.order import OrderRead


class OrderItemBatchBalance(BaseModel):
    order_item_id: int
    product_name: str
    unit: str
    order_quantity: Decimal
    planned_quantity_total: Decimal
    accepted_quantity_total: Decimal
    remaining_quantity_for_planning: Decimal
    remaining_quantity_for_completion: Decimal


class DeliveryBatchItemBase(BaseModel):
    order_item_id: int
    planned_quantity: Decimal = Field(gt=0)
    loaded_quantity: Decimal | None = Field(default=None, ge=0)
    accepted_quantity: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None


class DeliveryBatchItemCreate(DeliveryBatchItemBase):
    pass


class DeliveryBatchItemUpdate(BaseModel):
    order_item_id: int | None = None
    planned_quantity: Decimal | None = Field(default=None, gt=0)
    loaded_quantity: Decimal | None = Field(default=None, ge=0)
    accepted_quantity: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None


class DeliveryBatchItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    delivery_batch_id: int
    order_item_id: int
    contract_item_id: int
    product_name: str
    unit: str
    planned_quantity: Decimal
    loaded_quantity: Decimal | None
    accepted_quantity: Decimal | None
    difference_quantity: Decimal | None
    comment: str | None
    created_at: datetime
    updated_at: datetime
    balance: OrderItemBatchBalance | None = None
    # Buyurtma qatoridagi narx -- kamomadning pul qiymati shu narx bo'yicha
    # hisoblanadi va oynada kiritish paytida ko'rsatiladi.
    unit_price: Decimal | None = None
    vat_rate: Decimal | None = None


class LogisticsBase(BaseModel):
    status: LogisticsStatus = LogisticsStatus.not_assigned
    carrier_id: int | None = None
    carrier_name: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    vehicle_number: str | None = None
    trailer_number: str | None = None
    loading_address: str | None = None
    delivery_address: str | None = None
    planned_pickup_date: date | None = None
    planned_delivery_date: date | None = None
    actual_pickup_date: date | None = None
    actual_delivery_date: date | None = None
    cost_amount: Decimal | None = Field(default=None, ge=0)
    customer_price: Decimal | None = Field(default=None, ge=0)
    paid_by: PaidBy | None = None
    route_name: str | None = None
    distance_km: Decimal | None = Field(default=None, ge=0)
    loaded_mileage_km: Decimal | None = Field(default=None, ge=0)
    empty_mileage_km: Decimal | None = Field(default=None, ge=0)
    fuel_consumption_liters: Decimal | None = Field(default=None, ge=0)
    fuel_cost_amount: Decimal | None = Field(default=None, ge=0)
    driver_wage_amount: Decimal | None = Field(default=None, ge=0)
    esp_tax_percent: Decimal | None = Field(default=Decimal("12"), ge=0)
    other_expenses_amount: Decimal | None = Field(default=None, ge=0)
    business_trip_expenses_amount: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    created_by: str | None = None


class LogisticsCreate(LogisticsBase):
    pass


class LogisticsUpdate(LogisticsBase):
    status: LogisticsStatus | None = None


class LogisticsRead(LogisticsBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    delivery_batch_id: int
    logistics_number: str | None = None
    delivery_method: AutoDeliveryMethod
    created_at: datetime
    updated_at: datetime


class DeliveryBatchDocumentBase(BaseModel):
    document_type: BatchDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class DeliveryBatchDocumentCreate(DeliveryBatchDocumentBase):
    pass


class DeliveryBatchDocumentUpdate(BaseModel):
    document_type: BatchDocumentType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class DeliveryBatchDocumentRead(DeliveryBatchDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    delivery_batch_id: int
    uploaded_at: datetime


class DeliveryBatchNoteCreate(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class DeliveryBatchNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class DeliveryBatchNoteRead(DeliveryBatchNoteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    delivery_batch_id: int
    created_at: datetime


class LogisticsDocumentBase(BaseModel):
    document_type: LogisticsDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class LogisticsDocumentCreate(LogisticsDocumentBase):
    pass


class LogisticsDocumentUpdate(BaseModel):
    document_type: LogisticsDocumentType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class LogisticsDocumentRead(LogisticsDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    logistics_id: int
    uploaded_at: datetime


class LogisticsNoteCreate(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class LogisticsNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class LogisticsNoteRead(LogisticsNoteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    logistics_id: int
    created_at: datetime


class DeliveryBatchBase(BaseModel):
    order_id: int
    batch_number: str = Field(min_length=1, max_length=128)
    batch_date: date
    planned_loading_date: date | None = None
    planned_delivery_date: date | None = None
    actual_loading_date: date | None = None
    actual_delivery_date: date | None = None
    accepted_date: date | None = None
    status: BatchStatus = BatchStatus.planned
    supplier_id: int | None = None
    supplier_name: str | None = None
    notes: str | None = None
    created_by: str | None = None


class DeliveryBatchCreate(DeliveryBatchBase):
    items: list[DeliveryBatchItemCreate] = Field(min_length=1)
    logistics: LogisticsCreate | None = None
    documents: list[DeliveryBatchDocumentCreate] = Field(default_factory=list)
    initial_note: DeliveryBatchNoteCreate | None = None


class DeliveryBatchUpdate(BaseModel):
    order_id: int | None = None
    batch_number: str | None = Field(default=None, min_length=1, max_length=128)
    batch_date: date | None = None
    planned_loading_date: date | None = None
    planned_delivery_date: date | None = None
    actual_loading_date: date | None = None
    actual_delivery_date: date | None = None
    accepted_date: date | None = None
    status: BatchStatus | None = None
    supplier_id: int | None = None
    supplier_name: str | None = None
    notes: str | None = None
    created_by: str | None = None
    items: list[DeliveryBatchItemCreate] | None = None
    logistics: LogisticsCreate | None = None


class DeliveryBatchLoadingConfirm(BaseModel):
    actual_loading_date: date
    loaded_quantity: Decimal = Field(gt=0)
    notes: str | None = None
    allow_over_planned: bool = False


class DeliveryBatchDeliveryConfirm(BaseModel):
    actual_delivery_date: date
    notes: str | None = None


class DeliveryBatchAcceptanceItem(BaseModel):
    id: int
    accepted_quantity: Decimal
    comment: str | None = None


class DeliveryBatchAcceptanceConfirm(BaseModel):
    items: list[DeliveryBatchAcceptanceItem] = Field(default_factory=list)
    # Farq bo'lsa majburiy -- tekshiruv API qatlamida, chunki u qabul qilingan
    # miqdorlarga bog'liq.
    difference_resolution: str | None = None
    difference_note: str | None = None


class DeliveryBatchDifferenceRead(BaseModel):
    quantity: Decimal
    amount: Decimal
    resolution: str | None = None
    resolution_label: str | None = None
    note: str | None = None
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    warnings: list[str] = Field(default_factory=list)


class DeliveryBatchTransportCheck(BaseModel):
    delivery_method: str | None = None
    transport_payment_type: str | None = None
    customer_price: Decimal = Decimal("0")
    warnings: list[str] = Field(default_factory=list)


class DeliveryBatchCompletionConfirm(BaseModel):
    completed_date: date
    notes: str | None = None
    allow_missing_documents: bool = False
    allow_quantity_difference: bool = False


class DeliveryBatchSummary(BaseModel):
    total_planned_quantity: Decimal
    total_loaded_quantity: Decimal
    total_accepted_quantity: Decimal | None
    total_difference_quantity: Decimal | None
    items_count: int
    has_quantity_difference: bool
    documents_count: int
    logistics_status: LogisticsStatus | None


class DeliveryBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    contract_id: int
    client_id: int
    batch_number: str
    batch_date: date
    planned_loading_date: date | None
    planned_delivery_date: date | None
    actual_loading_date: date | None
    actual_delivery_date: date | None
    accepted_date: date | None
    status: BatchStatus
    fulfillment_type: str
    source_type: str
    delivery_method: AutoDeliveryMethod
    supplier_id: int | None
    supplier_name: str | None
    notes: str | None
    created_by: str | None
    difference_resolution: str | None = None
    difference_note: str | None = None
    created_at: datetime
    updated_at: datetime


class DeliveryBatchListItem(DeliveryBatchRead):
    client: ClientRead
    contract: ContractRead
    order: OrderRead
    product: str | None = None
    total_planned_quantity: Decimal
    total_loaded_quantity: Decimal
    total_accepted_quantity: Decimal | None
    total_difference_quantity: Decimal | None
    logistics_status: LogisticsStatus | None = None
    last_activity: datetime | None = None


class DeliveryBatchDetail(DeliveryBatchRead):
    client: ClientRead
    contract: ContractRead
    order: OrderRead
    items: list[DeliveryBatchItemRead] = Field(default_factory=list)
    logistics: LogisticsRead | None = None
    documents: list[DeliveryBatchDocumentRead] = Field(default_factory=list)
    notes_history: list[DeliveryBatchNoteRead] = Field(default_factory=list)
    summary: DeliveryBatchSummary | None = None
    order_item_balances: list[OrderItemBatchBalance] = Field(default_factory=list)
    difference: DeliveryBatchDifferenceRead | None = None
    # Shartnomadagi transport shartlari bajarilyaptimi -- bloklamaydi,
    # faqat ekranda ko'rsatiladi.
    transport_check: DeliveryBatchTransportCheck | None = None


class LogisticsListItem(LogisticsRead):
    batch: DeliveryBatchRead
    client: ClientRead
    order: OrderRead
    fulfillment_type: str


class LogisticsDetail(LogisticsRead):
    batch: DeliveryBatchRead
    client: ClientRead
    order: OrderRead
    documents: list[LogisticsDocumentRead] = Field(default_factory=list)
    notes_history: list[LogisticsNoteRead] = Field(default_factory=list)
