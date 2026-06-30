from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.finance import FinanceDocumentType, InvoiceStatus, InvoiceType, PaymentMethod, PaymentStatus
from backend.app.schemas.client import ClientRead
from backend.app.schemas.contract import ContractRead
from backend.app.schemas.delivery import DeliveryBatchRead, LogisticsRead
from backend.app.schemas.order import OrderRead


class InvoiceItemBase(BaseModel):
    description: str = Field(min_length=1)
    product_name: str | None = None
    unit: str | None = None
    quantity: Decimal
    unit_price: Decimal
    vat_rate: Decimal = Decimal("12")


class InvoiceItemCreate(InvoiceItemBase):
    pass


class InvoiceItemRead(InvoiceItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_id: int
    subtotal: Decimal
    vat_amount: Decimal
    total_with_vat: Decimal
    created_at: datetime
    updated_at: datetime


class AllocationCreate(BaseModel):
    invoice_id: int
    allocated_amount: Decimal = Field(gt=0)
    created_by: str | None = None


class AllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    payment_id: int
    invoice_id: int
    allocated_amount: Decimal
    created_by: str | None
    created_at: datetime


class FinanceDocumentCreate(BaseModel):
    client_id: int | None = None
    contract_id: int | None = None
    invoice_id: int | None = None
    payment_id: int | None = None
    document_type: FinanceDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class FinanceDocumentRead(FinanceDocumentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    uploaded_at: datetime


class FinanceNoteCreate(BaseModel):
    client_id: int | None = None
    contract_id: int | None = None
    invoice_id: int | None = None
    payment_id: int | None = None
    note: str = Field(min_length=1)
    created_by: str | None = None


class FinanceNoteRead(FinanceNoteCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    created_at: datetime


class InvoiceBase(BaseModel):
    client_id: int
    contract_id: int | None = None
    order_id: int | None = None
    delivery_batch_id: int | None = None
    logistics_id: int | None = None
    invoice_number: str = Field(min_length=1, max_length=128)
    invoice_date: date
    due_date: date
    invoice_type: InvoiceType
    status: InvoiceStatus = InvoiceStatus.draft
    currency: str = "UZS"
    notes: str | None = None
    created_by: str | None = None


class InvoiceCreate(InvoiceBase):
    items: list[InvoiceItemCreate] = Field(min_length=1)
    documents: list[FinanceDocumentCreate] = Field(default_factory=list)
    initial_note: FinanceNoteCreate | None = None


class InvoiceUpdate(BaseModel):
    client_id: int | None = None
    contract_id: int | None = None
    order_id: int | None = None
    delivery_batch_id: int | None = None
    logistics_id: int | None = None
    invoice_number: str | None = Field(default=None, min_length=1, max_length=128)
    invoice_date: date | None = None
    due_date: date | None = None
    invoice_type: InvoiceType | None = None
    status: InvoiceStatus | None = None
    currency: str | None = None
    notes: str | None = None
    created_by: str | None = None
    items: list[InvoiceItemCreate] | None = None


class InvoiceSummary(BaseModel):
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    items_count: int
    allocations_count: int


class InvoiceRead(InvoiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime
    updated_at: datetime


class InvoiceListItem(InvoiceRead):
    client: ClientRead
    contract: ContractRead | None = None
    order: OrderRead | None = None
    delivery_batch: DeliveryBatchRead | None = None


class InvoiceDetail(InvoiceRead):
    client: ClientRead
    contract: ContractRead | None = None
    order: OrderRead | None = None
    delivery_batch: DeliveryBatchRead | None = None
    logistics: LogisticsRead | None = None
    items: list[InvoiceItemRead] = Field(default_factory=list)
    allocations: list[AllocationRead] = Field(default_factory=list)
    documents: list[FinanceDocumentRead] = Field(default_factory=list)
    notes_history: list[FinanceNoteRead] = Field(default_factory=list)
    summary: InvoiceSummary | None = None


class PaymentBase(BaseModel):
    client_id: int
    payment_number: str = Field(min_length=1, max_length=128)
    payment_date: date
    amount: Decimal = Field(gt=0)
    currency: str = "UZS"
    payment_method: PaymentMethod
    bank_account: str | None = None
    reference_number: str | None = None
    status: PaymentStatus = PaymentStatus.received
    notes: str | None = None
    created_by: str | None = None


class PaymentCreate(PaymentBase):
    allocations: list[AllocationCreate] = Field(default_factory=list)
    documents: list[FinanceDocumentCreate] = Field(default_factory=list)
    initial_note: FinanceNoteCreate | None = None


class PaymentUpdate(BaseModel):
    client_id: int | None = None
    payment_number: str | None = Field(default=None, min_length=1, max_length=128)
    payment_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = None
    payment_method: PaymentMethod | None = None
    bank_account: str | None = None
    reference_number: str | None = None
    status: PaymentStatus | None = None
    notes: str | None = None
    created_by: str | None = None
    allocations: list[AllocationCreate] | None = None


class PaymentSummary(BaseModel):
    amount: Decimal
    allocated_amount: Decimal
    unallocated_amount: Decimal
    allocations_count: int


class PaymentRead(PaymentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class PaymentListItem(PaymentRead):
    client: ClientRead
    allocated_amount: Decimal
    unallocated_amount: Decimal


class PaymentDetail(PaymentRead):
    client: ClientRead
    allocations: list[AllocationRead] = Field(default_factory=list)
    documents: list[FinanceDocumentRead] = Field(default_factory=list)
    notes_history: list[FinanceNoteRead] = Field(default_factory=list)
    summary: PaymentSummary | None = None
