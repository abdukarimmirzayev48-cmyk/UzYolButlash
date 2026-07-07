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
    product_id: int | None = None
    product_name: str = Field(min_length=1, max_length=255)
    product_code: str | None = None
    product_brand: str | None = None
    catalog_code: str | None = None
    barcode: str | None = None
    unit: str = Field(min_length=1, max_length=64)
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Field(default=Decimal("12"), ge=0)


class ContractItemCreate(ContractItemBase):
    pass


class ContractItemUpdate(BaseModel):
    product_id: int | None = None
    product_name: str | None = Field(default=None, min_length=1, max_length=255)
    product_code: str | None = None
    product_brand: str | None = None
    catalog_code: str | None = None
    barcode: str | None = None
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
    client_id: int | None = None
    contract_number: str = Field(min_length=1, max_length=128)
    contract_date: date
    valid_until: date
    title: str | None = None
    status: ContractStatus = ContractStatus.draft
    currency: str = "UZS"
    notes: str | None = None
    created_by: str | None = None
    customer_request_id: int | None = None
    place: str | None = None
    customer_name: str | None = None
    customer_director_full_name: str | None = None
    customer_inn: str | None = None
    customer_oked: str | None = None
    customer_legal_address: str | None = None
    customer_bank_account: str | None = None
    customer_bank_name: str | None = None
    customer_mfo: str | None = None
    customer_phone: str | None = None
    executor_name: str | None = None
    executor_director_full_name: str | None = None
    executor_inn: str | None = None
    executor_oked: str | None = None
    executor_legal_address: str | None = None
    executor_bank_account: str | None = None
    executor_bank_name: str | None = None
    executor_mfo: str | None = None
    executor_phone: str | None = None
    didox_id: str | None = None
    rouming_id: str | None = None


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
    customer_request_id: int | None = None
    place: str | None = None
    customer_name: str | None = None
    customer_director_full_name: str | None = None
    customer_inn: str | None = None
    customer_oked: str | None = None
    customer_legal_address: str | None = None
    customer_bank_account: str | None = None
    customer_bank_name: str | None = None
    customer_mfo: str | None = None
    customer_phone: str | None = None
    executor_name: str | None = None
    executor_director_full_name: str | None = None
    executor_inn: str | None = None
    executor_oked: str | None = None
    executor_legal_address: str | None = None
    executor_bank_account: str | None = None
    executor_bank_name: str | None = None
    executor_mfo: str | None = None
    executor_phone: str | None = None
    didox_id: str | None = None
    rouming_id: str | None = None
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
    source_file_path: str | None = None
    original_filename: str | None = None
    parsed_text_path: str | None = None
    parser_version: str | None = None
    parse_confidence: Decimal | None = None
    parse_warnings: str | None = None


class ContractListItem(ContractRead):
    client: ClientRead | None = None
    product: str | None = None
    total_quantity: Decimal
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    last_activity: datetime | None = None


class ContractDetail(ContractRead):
    client: ClientRead | None = None
    items: list[ContractItemRead] = Field(default_factory=list)
    payment_terms: ContractPaymentTermsRead | None = None
    transport_terms: ContractTransportTermsRead | None = None
    documents: list[ContractDocumentRead] = Field(default_factory=list)
    notes_history: list[ContractNoteRead] = Field(default_factory=list)
    summary: ContractSummary | None = None


class ParsedContractItem(BaseModel):
    product_id: int | None = None
    product_name: str | None = None
    product_brand: str | None = None
    catalog_code: str | None = None
    barcode: str | None = None
    unit: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    amount_without_vat: Decimal | None = None
    vat_rate: Decimal | None = None
    vat_amount: Decimal | None = None
    amount_with_vat: Decimal | None = None


class ParsedContractData(BaseModel):
    contract_number: str | None = None
    contract_date: date | None = None
    valid_until: date | None = None
    place: str | None = None
    customer_id: int | None = None
    customer_request_id: int | None = None
    customer_name: str | None = None
    customer_director_full_name: str | None = None
    customer_inn: str | None = None
    customer_oked: str | None = None
    customer_legal_address: str | None = None
    customer_bank_account: str | None = None
    customer_bank_name: str | None = None
    customer_mfo: str | None = None
    customer_phone: str | None = None
    executor_name: str | None = None
    executor_director_full_name: str | None = None
    executor_inn: str | None = None
    executor_oked: str | None = None
    executor_legal_address: str | None = None
    executor_bank_account: str | None = None
    executor_bank_name: str | None = None
    executor_mfo: str | None = None
    executor_phone: str | None = None
    total_without_vat: Decimal | None = None
    vat_rate: Decimal | None = None
    vat_amount: Decimal | None = None
    total_with_vat: Decimal | None = None
    prepayment_percent: Decimal | None = None
    prepayment_amount: Decimal | None = None
    remaining_payment_percent: Decimal | None = None
    payment_terms_text: str | None = None
    transport_cost_separate: bool = False
    didox_id: str | None = None
    rouming_id: str | None = None
    status: ContractStatus = ContractStatus.active
    items: list[ParsedContractItem] = Field(default_factory=list)


class ContractParseResponse(BaseModel):
    success: bool = True
    data: dict


class ContractFromParsedCreate(ParsedContractData):
    parse_session_id: int
    customer_id: int | None = None
    status: ContractStatus = ContractStatus.active


class ContractFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int | None = None
    parse_session_id: int | None = None
    original_filename: str
    file_path: str
    file_type: str
    file_size: int
    uploaded_by: str | None = None
    created_at: datetime
