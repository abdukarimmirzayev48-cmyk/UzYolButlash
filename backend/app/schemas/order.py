from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.order import FulfillmentType, OrderDocumentType, OrderStatus, SourceType, SupplierStatus
from backend.app.schemas.client import ClientRead
from backend.app.schemas.contract import ContractRead


class ContractItemBalance(BaseModel):
    contract_item_id: int
    product_name: str
    unit: str
    unit_price: Decimal
    vat_rate: Decimal
    contract_quantity: Decimal
    ordered_quantity: Decimal
    remaining_quantity: Decimal


class OrderItemBase(BaseModel):
    contract_item_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0)


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemUpdate(BaseModel):
    contract_item_id: int | None = None
    quantity: Decimal | None = Field(default=None, gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    contract_item_id: int
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal
    vat_rate: Decimal
    vat_amount: Decimal
    total_with_vat: Decimal
    created_at: datetime
    updated_at: datetime
    balance: ContractItemBalance | None = None


class SupplierOptionBase(BaseModel):
    supplier_id: int | None = None
    supplier_name: str = Field(min_length=1, max_length=255)
    offered_price: Decimal | None = Field(default=None, ge=0)
    currency: str = "UZS"
    available_quantity: Decimal | None = Field(default=None, ge=0)
    ready_date: date | None = None
    delivery_terms: str | None = None
    comment: str | None = None
    is_selected: bool = False


class SupplierOptionCreate(SupplierOptionBase):
    pass


class SupplierOptionUpdate(BaseModel):
    supplier_id: int | None = None
    supplier_name: str | None = Field(default=None, min_length=1, max_length=255)
    offered_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None
    available_quantity: Decimal | None = Field(default=None, ge=0)
    ready_date: date | None = None
    delivery_terms: str | None = None
    comment: str | None = None
    is_selected: bool | None = None


class SupplierOptionRead(SupplierOptionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    created_at: datetime
    updated_at: datetime


class OrderDocumentBase(BaseModel):
    document_type: OrderDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class OrderDocumentCreate(OrderDocumentBase):
    pass


class OrderDocumentUpdate(BaseModel):
    document_type: OrderDocumentType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class OrderDocumentRead(OrderDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    uploaded_at: datetime


class OrderNoteBase(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class OrderNoteCreate(OrderNoteBase):
    pass


class OrderNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class OrderNoteRead(OrderNoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    created_at: datetime


class OrderBase(BaseModel):
    contract_id: int
    order_number: str = Field(min_length=1, max_length=128)
    order_date: date
    required_date: date | None = None
    status: OrderStatus = OrderStatus.draft
    fulfillment_type: FulfillmentType = FulfillmentType.direct_supplier_to_customer
    source_type: SourceType = SourceType.other
    supplier_id: int | None = None
    supplier_name: str | None = None
    supplier_status: SupplierStatus = SupplierStatus.not_selected
    supplier_notes: str | None = None
    currency: str = "UZS"
    markup_percent: Decimal | None = Field(default=None, ge=0)
    markup_amount: Decimal | None = Field(default=None, ge=0)
    logistics_price: Decimal | None = Field(default=Decimal("0"), ge=0)
    notes: str | None = None
    created_by: str | None = None


class OrderCreate(OrderBase):
    items: list[OrderItemCreate] = Field(min_length=1)
    supplier_options: list[SupplierOptionCreate] = Field(default_factory=list)
    documents: list[OrderDocumentCreate] = Field(default_factory=list)
    initial_note: OrderNoteCreate | None = None


class OrderUpdate(BaseModel):
    contract_id: int | None = None
    order_number: str | None = Field(default=None, min_length=1, max_length=128)
    order_date: date | None = None
    required_date: date | None = None
    status: OrderStatus | None = None
    fulfillment_type: FulfillmentType | None = None
    source_type: SourceType | None = None
    supplier_id: int | None = None
    supplier_name: str | None = None
    supplier_status: SupplierStatus | None = None
    supplier_notes: str | None = None
    currency: str | None = None
    markup_percent: Decimal | None = Field(default=None, ge=0)
    markup_amount: Decimal | None = Field(default=None, ge=0)
    logistics_price: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    created_by: str | None = None
    items: list[OrderItemCreate] | None = None


class OrderManualStatusUpdate(BaseModel):
    status: OrderStatus


class OrderSummary(BaseModel):
    total_quantity: Decimal
    product_subtotal: Decimal
    vat_amount: Decimal
    markup_percent: Decimal
    markup_amount: Decimal
    logistics_price: Decimal
    total_amount: Decimal
    delivered_quantity: Decimal
    # Loaded and on its way, but not yet accepted by the customer.
    loaded_quantity: Decimal = Decimal("0")
    in_transit_quantity: Decimal = Decimal("0")
    # Committed to a batch, whether or not it has moved yet.
    planned_quantity: Decimal = Decimal("0")
    unplanned_quantity: Decimal = Decimal("0")
    remaining_quantity: Decimal
    items_count: int
    paid_amount: Decimal
    delivery_batches_count: int


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    contract_id: int
    order_number: str
    order_date: date
    required_date: date | None
    status: OrderStatus
    fulfillment_type: FulfillmentType
    source_type: SourceType
    supplier_id: int | None
    supplier_name: str | None
    supplier_status: SupplierStatus
    supplier_notes: str | None
    currency: str
    product_subtotal: Decimal
    vat_amount: Decimal
    markup_percent: Decimal
    markup_amount: Decimal
    logistics_price: Decimal
    total_amount: Decimal
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class OrderListItem(OrderRead):
    client: ClientRead
    contract: ContractRead
    product: str | None = None
    total_quantity: Decimal
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    last_activity: datetime | None = None


ORDER_STATUS_LABELS = {
    "draft": "Qoralama",
    "created": "Yaratilgan",
    "supplier_search": "Ta'minotchi qidirilmoqda",
    "supplier_selected": "Ta'minotchi tanlangan",
    "supplier_confirmed": "Ta'minotchi tasdiqlangan",
    "waiting_payment": "To'lov kutilmoqda",
    "ready_for_delivery": "Yetkazishga tayyor",
    "in_delivery": "Yetkazilmoqda",
    "partially_delivered": "Qisman yetkazildi",
    "delivered": "Yetkazildi",
    "documents_pending": "Hujjatlar kutilmoqda",
    "closed": "Yopildi",
    "on_hold": "To'xtatib turilgan",
    "cancelled": "Bekor qilingan",
}


class OrderContractLine(BaseModel):
    product_name: str | None = None
    order_unit_price: Decimal
    contract_unit_price: Decimal | None = None
    difference_percent: Decimal
    linked: bool


class OrderContractCheckRead(BaseModel):
    """How far this order's price sits from the contract it belongs to."""

    contract_goods_amount: Decimal
    order_goods_amount: Decimal
    goods_difference: Decimal
    goods_difference_percent: Decimal
    markup_amount: Decimal
    logistics_price: Decimal
    charged_total: Decimal
    contract_supported_total: Decimal
    excess_amount: Decimal
    excess_percent: Decimal
    transport_separate: bool
    warnings: list[str] = Field(default_factory=list)
    lines: list[OrderContractLine] = Field(default_factory=list)


class OrderDetail(OrderRead):
    client: ClientRead
    contract: ContractRead
    items: list[OrderItemRead] = Field(default_factory=list)
    supplier_options: list[SupplierOptionRead] = Field(default_factory=list)
    documents: list[OrderDocumentRead] = Field(default_factory=list)
    notes_history: list[OrderNoteRead] = Field(default_factory=list)
    summary: OrderSummary | None = None
    contract_item_balances: list[ContractItemBalance] = Field(default_factory=list)
    contract_check: OrderContractCheckRead | None = None
    # Tanlangan ta'minotchi manba turiga mos keladimi -- bloklamaydi, faqat
    # ogohlantiradi.
    source_warnings: list[str] = Field(default_factory=list)
