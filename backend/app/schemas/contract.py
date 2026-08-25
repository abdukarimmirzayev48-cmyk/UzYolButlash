import json
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class ContractDateRules(BaseModel):
    """Date sanity, mixed into the write shapes only.

    Never into ContractBase: the Read schemas extend it, and a rule applied on
    the way out makes the three zero-day contracts already on file unreadable
    -- a 500 on the very records that need correcting. Input refuses bad data;
    output shows what is stored.
    """

    @model_validator(mode="after")
    def _valid_until_after_contract_date(self):
        # A contract that expires the day it is signed is a data-entry slip, not
        # a business arrangement -- the three on file all came from the PDF
        # parser filling the field in from the contract date.
        contract_date = getattr(self, "contract_date", None)
        valid_until = getattr(self, "valid_until", None)
        if valid_until and contract_date and valid_until <= contract_date:
            raise ValueError("Amal qilish muddati shartnoma sanasidan keyin bo'lishi kerak.")
        return self


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


class ContractCreate(ContractBase, ContractDateRules):
    items: list[ContractItemCreate] = Field(min_length=1)
    payment_terms: ContractPaymentTermsCreate | None = None
    transport_terms: ContractTransportTermsCreate | None = None
    documents: list[ContractDocumentCreate] = Field(default_factory=list)
    initial_note: ContractNoteCreate | None = None


class ContractUpdate(ContractDateRules):
    """Everything on a contract except its status.

    Status moves through POST /contracts/{id}/status, which checks the move is
    legal and records who made it. Leaving it here as well meant the edit form
    could put a draft straight into "completed" with no trail -- the rule and
    the history would exist and be trivially bypassed.
    """

    client_id: int | None = None
    contract_number: str | None = Field(default=None, min_length=1, max_length=128)
    contract_date: date | None = None
    valid_until: date | None = None
    title: str | None = None
    currency: str | None = None
    notes: str | None = None
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


class ContractScheduleBase(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    quantity: Decimal = Field(gt=0)


class ContractScheduleCreate(ContractScheduleBase):
    pass


class ContractScheduleUpdate(BaseModel):
    year: int | None = Field(default=None, ge=2000, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)
    quantity: Decimal | None = Field(default=None, gt=0)


class ContractScheduleRead(ContractScheduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int


class PlanMonthRead(BaseModel):
    year: int
    month: int
    planned: Decimal
    delivered: Decimal
    planned_cumulative: Decimal
    delivered_cumulative: Decimal
    difference: Decimal
    is_past: bool


class DeliveryPlanRead(BaseModel):
    months: list[PlanMonthRead] = Field(default_factory=list)
    planned_total: Decimal = Decimal("0")
    delivered_total: Decimal = Decimal("0")
    due_by_now: Decimal = Decimal("0")
    behind_by: Decimal = Decimal("0")
    has_schedule: bool = False
    warnings: list[str] = Field(default_factory=list)


class OverdueOrderRead(BaseModel):
    id: int
    order_number: str
    required_date: date | None = None
    status: str
    status_label: str | None = None
    overdue_days: int


class BillingPositionRead(BaseModel):
    """What the customer owes on this contract against what they have been
    asked for."""

    billable: Decimal
    invoiced: Decimal
    paid: Decimal
    remaining_to_bill: Decimal
    over_billed: Decimal
    advance_invoiced: Decimal
    advance_paid: Decimal


class PaymentDueItem(BaseModel):
    kind: str
    label: str
    due_date: date | None = None
    amount: Decimal
    paid_amount: Decimal
    outstanding: Decimal
    overdue_days: int
    is_overdue: bool


class ContractSummary(BaseModel):
    subtotal_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal
    total_quantity: Decimal
    # Turned into orders (whatever their delivery state) and what is left to
    # order. Distinct from delivered/remaining, which are about goods moving.
    ordered_quantity: Decimal = Decimal("0")
    unordered_quantity: Decimal = Decimal("0")
    advance_amount: Decimal
    remaining_amount: Decimal
    items_count: int
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    paid_amount: Decimal
    unpaid_amount: Decimal
    # What the carrier costs us.
    transport_expense_total: Decimal
    # What the customer is charged for transport -- a different figure, and the
    # one that reaches their invoice.
    transport_billed_total: Decimal = Decimal("0")
    # When the money is actually due, and what is late. The terms held the
    # numbers ("10 kun") and nobody ever turned them into a date.
    payment_schedule: list[PaymentDueItem] = Field(default_factory=list)
    overdue_count: int = 0
    overdue_amount: Decimal = Decimal("0")
    max_overdue_days: int = 0
    # Orders past their requested date. The card said "Jarayonda" while six of
    # them were three to four months late.
    overdue_orders: list[OverdueOrderRead] = Field(default_factory=list)
    # The advance is raised against the contract, so the billing position can
    # only be taken here -- taken per order it misses the advance entirely.
    billing: BillingPositionRead | None = None
    # Bo'lim yorliqlaridagi sanoqlar: bo'limni ochib ko'rish kerakmi degan
    # savolga javob beradi.
    orders_count: int = 0
    batches_count: int = 0
    invoices_count: int = 0


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
    # Stored as a JSON array; returned as one. Declared as a string it reached
    # the browser as the text "[]", where .length is 2 and every contract looked
    # like it had two warnings.
    parse_warnings: list[str] = Field(default_factory=list)

    @field_validator("parse_warnings", mode="before")
    @classmethod
    def _parse_warnings(cls, value):
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return value
        try:
            decoded = json.loads(value)
        except (TypeError, ValueError):
            # Older rows may hold a bare sentence rather than JSON.
            return [str(value)]
        return decoded if isinstance(decoded, list) else [str(decoded)]


class ContractListItem(ContractRead):
    client: ClientRead | None = None
    product: str | None = None
    total_quantity: Decimal
    delivered_quantity: Decimal
    remaining_quantity: Decimal
    last_activity: datetime | None = None


CONTRACT_STATUS_LABELS = {
    "draft": "Qoralama",
    "signed": "Imzolangan",
    "active": "Faol",
    "completed": "Yakunlangan",
    "expired": "Muddati tugagan",
    "cancelled": "Bekor qilingan",
}


class ContractStatusTransition(BaseModel):
    status: str
    label: str
    direction: str
    requires_comment: bool


class ContractStatusChange(BaseModel):
    status: str
    comment: str | None = Field(default=None, max_length=1000)


class ContractStatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    old_status: str | None = None
    new_status: str
    old_status_label: str | None = None
    new_status_label: str | None = None
    changed_by: str | None = None
    comment: str | None = None
    created_at: datetime


class ContractDetail(ContractRead):
    client: ClientRead | None = None
    items: list[ContractItemRead] = Field(default_factory=list)
    payment_terms: ContractPaymentTermsRead | None = None
    transport_terms: ContractTransportTermsRead | None = None
    documents: list[ContractDocumentRead] = Field(default_factory=list)
    notes_history: list[ContractNoteRead] = Field(default_factory=list)
    status_history: list[ContractStatusHistoryRead] = Field(default_factory=list)
    schedule: list[ContractScheduleRead] = Field(default_factory=list)
    delivery_plan: DeliveryPlanRead | None = None
    # Which moves are legal from where this contract stands, so the buttons on
    # screen are exactly what the API will accept.
    available_transitions: list[ContractStatusTransition] = Field(default_factory=list)
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
