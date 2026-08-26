from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.supplier_finance import (
    SupplierFinanceDocumentType,
    SupplierInvoiceStatus,
    SupplierInvoiceType,
    SupplierPaymentMethod,
    SupplierPaymentStatus,
)
from backend.app.schemas.delivery import DeliveryBatchRead, LogisticsRead
from backend.app.schemas.procurement import ProcurementRead, SupplierOfferRead, SupplierRead


class SupplierInvoiceItemBase(BaseModel):
    procurement_item_id: int | None = None
    supplier_offer_item_id: int | None = None
    description: str = Field(min_length=1)
    product_name: str | None = None
    unit: str | None = None
    quantity: Decimal
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Decimal("12")


class SupplierInvoiceItemCreate(SupplierInvoiceItemBase):
    pass


class SupplierInvoiceItemRead(SupplierInvoiceItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_invoice_id: int
    subtotal: Decimal
    vat_amount: Decimal
    total_with_vat: Decimal
    created_at: datetime
    updated_at: datetime


class SupplierPaymentAllocationCreate(BaseModel):
    supplier_invoice_id: int
    allocated_amount: Decimal = Field(gt=0)
    created_by: str | None = None


class SupplierPaymentAllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_payment_id: int
    supplier_invoice_id: int
    allocated_amount: Decimal
    created_by: str | None
    created_at: datetime


class SupplierFinanceDocumentCreate(BaseModel):
    supplier_id: int | None = None
    procurement_id: int | None = None
    supplier_invoice_id: int | None = None
    supplier_payment_id: int | None = None
    document_type: SupplierFinanceDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class SupplierFinanceDocumentRead(SupplierFinanceDocumentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    uploaded_at: datetime


class SupplierFinanceNoteCreate(BaseModel):
    supplier_id: int | None = None
    procurement_id: int | None = None
    supplier_invoice_id: int | None = None
    supplier_payment_id: int | None = None
    note: str = Field(min_length=1)
    created_by: str | None = None


class SupplierFinanceNoteRead(SupplierFinanceNoteCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    created_at: datetime


class SupplierInvoiceBase(BaseModel):
    supplier_id: int
    procurement_id: int
    supplier_offer_id: int | None = None
    delivery_batch_id: int | None = None
    logistics_id: int | None = None
    invoice_number: str = Field(min_length=1, max_length=128)
    invoice_date: date
    due_date: date
    invoice_type: SupplierInvoiceType
    status: SupplierInvoiceStatus = SupplierInvoiceStatus.draft
    currency: str = "UZS"
    notes: str | None = None
    created_by: str | None = None


class SupplierInvoiceCreate(SupplierInvoiceBase):
    items: list[SupplierInvoiceItemCreate] = Field(min_length=1)
    documents: list[SupplierFinanceDocumentCreate] = Field(default_factory=list)
    initial_note: SupplierFinanceNoteCreate | None = None


class SupplierInvoiceUpdate(BaseModel):
    supplier_id: int | None = None
    procurement_id: int | None = None
    supplier_offer_id: int | None = None
    delivery_batch_id: int | None = None
    logistics_id: int | None = None
    invoice_number: str | None = Field(default=None, min_length=1, max_length=128)
    invoice_date: date | None = None
    due_date: date | None = None
    invoice_type: SupplierInvoiceType | None = None
    status: SupplierInvoiceStatus | None = None
    currency: str | None = None
    notes: str | None = None
    created_by: str | None = None
    items: list[SupplierInvoiceItemCreate] | None = None


class SupplierInvoiceSummary(BaseModel):
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    items_count: int
    allocations_count: int


class SupplierInvoiceRead(SupplierInvoiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime
    updated_at: datetime


class SupplierInvoiceListItem(SupplierInvoiceRead):
    supplier: SupplierRead
    procurement: ProcurementRead
    supplier_offer: SupplierOfferRead | None = None
    delivery_batch: DeliveryBatchRead | None = None


class SupplierInvoiceDetail(SupplierInvoiceRead):
    supplier: SupplierRead
    procurement: ProcurementRead
    supplier_offer: SupplierOfferRead | None = None
    delivery_batch: DeliveryBatchRead | None = None
    logistics: LogisticsRead | None = None
    items: list[SupplierInvoiceItemRead] = Field(default_factory=list)
    allocations: list[SupplierPaymentAllocationRead] = Field(default_factory=list)
    documents: list[SupplierFinanceDocumentRead] = Field(default_factory=list)
    notes_history: list[SupplierFinanceNoteRead] = Field(default_factory=list)
    summary: SupplierInvoiceSummary | None = None


class SupplierPaymentBase(BaseModel):
    supplier_id: int
    payment_number: str = Field(min_length=1, max_length=128)
    payment_date: date
    amount: Decimal = Field(gt=0)
    currency: str = "UZS"
    payment_method: SupplierPaymentMethod
    bank_account: str | None = None
    reference_number: str | None = None
    status: SupplierPaymentStatus = SupplierPaymentStatus.paid
    notes: str | None = None
    created_by: str | None = None


class SupplierPaymentCreate(SupplierPaymentBase):
    # Mijoz to'lovidagi kabi: bo'sh qoldirilsa raqamni server beradi.
    payment_number: str | None = Field(default=None, min_length=1, max_length=128)
    allocations: list[SupplierPaymentAllocationCreate] = Field(default_factory=list)
    documents: list[SupplierFinanceDocumentCreate] = Field(default_factory=list)
    initial_note: SupplierFinanceNoteCreate | None = None


class SupplierPaymentUpdate(BaseModel):
    supplier_id: int | None = None
    payment_number: str | None = Field(default=None, min_length=1, max_length=128)
    payment_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = None
    payment_method: SupplierPaymentMethod | None = None
    bank_account: str | None = None
    reference_number: str | None = None
    status: SupplierPaymentStatus | None = None
    notes: str | None = None
    created_by: str | None = None
    allocations: list[SupplierPaymentAllocationCreate] | None = None


class SupplierPaymentSummary(BaseModel):
    amount: Decimal
    allocated_amount: Decimal
    unallocated_amount: Decimal
    allocations_count: int


class SupplierPaymentRead(SupplierPaymentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class SupplierPaymentListItem(SupplierPaymentRead):
    supplier: SupplierRead
    allocated_amount: Decimal
    unallocated_amount: Decimal


class SupplierPaymentDetail(SupplierPaymentRead):
    supplier: SupplierRead
    allocations: list[SupplierPaymentAllocationRead] = Field(default_factory=list)
    documents: list[SupplierFinanceDocumentRead] = Field(default_factory=list)
    notes_history: list[SupplierFinanceNoteRead] = Field(default_factory=list)
    summary: SupplierPaymentSummary | None = None


class SupplierBalanceSummary(BaseModel):
    supplier_id: int
    total_invoiced: Decimal
    total_paid: Decimal
    balance: Decimal


class GenerateSupplierInvoicesRequest(BaseModel):
    invoice_date: date | None = None
    due_date: date | None = None
    status: SupplierInvoiceStatus = SupplierInvoiceStatus.received
    delivery_batch_id: int | None = None
    created_by: str | None = None
