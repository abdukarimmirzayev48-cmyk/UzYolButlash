from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.contract import (
    ContractDocumentType,
    ContractStatus,
    DeliveryMethod,
    TransportPaymentType,
)
from backend.app.schemas.client import ClientRead


class ContractItemBase(BaseModel):
    product_name: str = Field(min_length=1, max_length=255)
    product_code: str | None = None
    unit: str = Field(min_length=1, max_length=64)
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Field(default=Decimal("12"), ge=0)


class ContractItemCreate(ContractItemBase):
    pass


class ContractItemUpdate(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=255)
    product_code: str | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    quantity: Decimal | None = Field(default=None, gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: Decimal | None = Field(default=None, ge=0)


class ContractItemRead(ContractItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    subtotal: Decimal
    vat_amount: Decimal
    total_with_vat: Decimal
    created_at: datetime
    updated_at: datetime


class ContractPaymentTermsBase(BaseModel):
    advance_percent: Decimal = Field(default=Decimal("30"), ge=0, le=100)
    remaining_percent: Decimal = Field(default=Decimal("70"), ge=0, le=100)
    advance_due_days: int = Field(default=10, ge=0)
    batch_payment_due_days: int = Field(default=3, ge=0)
    remaining_payment_rule: str = (
        "Payment of the remaining amount is made per ready delivery batch based on invoice."
    )
    notes: str | None = None


class ContractPaymentTermsCreate(ContractPaymentTermsBase):
    pass


class ContractPaymentTermsUpdate(BaseModel):
    advance_percent: Decimal | None = Field(default=None, ge=0, le=100)
    remaining_percent: Decimal | None = Field(default=None, ge=0, le=100)
    advance_due_days: int | None = Field(default=None, ge=0)
    batch_payment_due_days: int | None = Field(default=None, ge=0)
    remaining_payment_rule: str | None = None
    notes: str | None = None


class ContractPaymentTermsRead(ContractPaymentTermsBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    advance_amount: Decimal
    created_at: datetime
    updated_at: datetime


class ContractTransportTermsBase(BaseModel):
    transport_payment_type: TransportPaymentType = TransportPaymentType.separate_invoice
    delivery_method: DeliveryMethod = DeliveryMethod.mixed
    notes: str | None = None


class ContractTransportTermsCreate(ContractTransportTermsBase):
    pass


class ContractTransportTermsUpdate(BaseModel):
    transport_payment_type: TransportPaymentType | None = None
    delivery_method: DeliveryMethod | None = None
    notes: str | None = None


class ContractTransportTermsRead(ContractTransportTermsBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    created_at: datetime
    updated_at: datetime


class ContractDocumentBase(BaseModel):
    document_type: ContractDocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class ContractDocumentCreate(ContractDocumentBase):
    pass


class ContractDocumentUpdate(BaseModel):
    document_type: ContractDocumentType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class ContractDocumentRead(ContractDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    uploaded_at: datetime


class ContractNoteBase(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class ContractNoteCreate(ContractNoteBase):
    pass


class ContractNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class ContractNoteRead(ContractNoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    created_at: datetime


class ContractBase(BaseModel):
    client_id: int
    contract_number: str = Field(min_length=1, max_length=128)
    contract_date: date
    valid_until: date
    title: str | None = None
    status: ContractStatus = ContractStatus.draft
    currency: str = "UZS"
    notes: str | None = None
    created_by: str | None = None


class ContractCreate(ContractBase):
    items: list[ContractItemCreate] = Field(min_length=1)
    payment_terms: ContractPaymentTermsCreate | None = None
    transport_terms: ContractTransportTermsCreate | None = None
    documents: list[ContractDocumentCreate] = Field(default_factory=list)
    initial_note: ContractNoteCreate | None = None


class ContractUpdate(BaseModel):
    client_id: int | None = None
    contract_number: str | None = Field(default=None, min_length=1, max_length=128)
    contract_date: date | None = None
    valid_until: date | None = None
    title: str | None = None
    status: ContractStatus | None = None
    currency: str | None = None
    notes: str | None = None
    created_by: str | None = None
    items: list[ContractItemCreate] | None = None
    payment_terms: ContractPaymentTermsCreate | None = None
    transport_terms: ContractTransportTermsCreate | None = None


class ContractSummary(BaseModel):
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    total_quantity: Decimal
    advance_amount: Decimal
    remaining_amount: Decimal
    items_count: int
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    paid_amount: Decimal
    unpaid_amount: Decimal
    transport_expense_total: Decimal


class ContractRead(ContractBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime


class ContractListItem(ContractRead):
    client: ClientRead
    product: str | None = None
    total_quantity: Decimal
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    last_activity: datetime | None = None


class ContractDetail(ContractRead):
    client: ClientRead
    items: list[ContractItemRead] = Field(default_factory=list)
    payment_terms: ContractPaymentTermsRead | None = None
    transport_terms: ContractTransportTermsRead | None = None
    documents: list[ContractDocumentRead] = Field(default_factory=list)
    notes_history: list[ContractNoteRead] = Field(default_factory=list)
    summary: ContractSummary | None = None
