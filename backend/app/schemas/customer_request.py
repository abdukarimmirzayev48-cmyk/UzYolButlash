from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.models.customer_request import CustomerRequestStatus, CustomerType, PaymentSource
from backend.app.schemas.delivery_point import DeliveryPointSummary
from backend.app.schemas.client import Page


CUSTOMER_TYPE_LABELS = {
    CustomerType.internal_organization: "Tizim tashkiloti",
    CustomerType.external_customer: "Tashqi mijoz",
}

PAYMENT_SOURCE_LABELS = {
    PaymentSource.treasury: "G'azna",
    PaymentSource.bank: "Bank",
}

REQUEST_STATUS_LABELS = {
    CustomerRequestStatus.new: "Yangi",
    CustomerRequestStatus.reviewing: "Ko'rib chiqilmoqda",
    CustomerRequestStatus.negotiation: "Muzokarada",
    CustomerRequestStatus.contract_preparation: "Shartnoma tayyorlanmoqda",
    CustomerRequestStatus.contract_signed: "Shartnoma imzolandi",
    CustomerRequestStatus.converted_to_order: "Buyurtmaga o'tkazildi",
    CustomerRequestStatus.rejected: "Rad etildi",
}


def label_for(mapping: dict, value):
    return mapping.get(value, str(value or ""))


class CompanyRegistryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    inn: str
    company_name: str
    region: str | None = None
    legal_address: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None


class PublicProductRead(BaseModel):
    id: int
    name: str
    product_type: str | None = None
    brand: str | None = None
    unit: str


class CustomerRequestScheduleBase(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    quantity: Decimal = Field(gt=0)


class CustomerRequestScheduleCreate(CustomerRequestScheduleBase):
    pass


class CustomerRequestScheduleRead(CustomerRequestScheduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ProductSummary(BaseModel):
    id: int
    name: str
    product_type: str | None = None
    brand: str | None = None
    unit: str


class CustomerRequestBase(BaseModel):
    customer_type: CustomerType
    payment_source: PaymentSource
    company_name: str = Field(min_length=1, max_length=255)
    inn: str | None = None
    region: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    phone: str | None = Field(default=None, max_length=64)
    contact_full_name: str | None = None
    contact_phone: str | None = None
    product_id: int
    total_quantity: Decimal = Field(gt=0)
    unit: str = Field(min_length=1, max_length=64)

    @field_validator("inn")
    @classmethod
    def inn_must_be_digits(cls, value: str | None) -> str | None:
        if value and not value.isdigit():
            raise ValueError("STIR faqat raqamlardan iborat bo'lishi kerak.")
        return value


class RequestNamedCount(BaseModel):
    key: str
    label: str
    count: int = 0
    quantity: Decimal = Decimal("0")


class RequestMonthPoint(BaseModel):
    month: str
    created: int = 0
    converted: int = 0
    rejected: int = 0


class RequestStaleRow(BaseModel):
    id: int
    request_number: str
    company_name: str
    status: str
    status_label: str
    days_open: int
    quantity: Decimal


class RequestDashboardRead(BaseModel):
    total: int = 0
    open_count: int = 0
    converted_count: int = 0
    rejected_count: int = 0
    stale_count: int = 0
    total_quantity: Decimal = Decimal("0")
    converted_quantity: Decimal = Decimal("0")
    conversion_percent: Decimal | None = None
    average_days_to_convert: Decimal | None = None
    by_status: list[RequestNamedCount] = Field(default_factory=list)
    by_product: list[RequestNamedCount] = Field(default_factory=list)
    by_region: list[RequestNamedCount] = Field(default_factory=list)
    by_month: list[RequestMonthPoint] = Field(default_factory=list)
    top_clients: list[RequestNamedCount] = Field(default_factory=list)
    stale: list[RequestStaleRow] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)



class RequestPrefillRead(BaseModel):
    client_id: int | None = None
    company_name: str | None = None
    inn: str | None = None
    region: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    phone: str | None = None
    contact_full_name: str | None = None
    contact_phone: str | None = None
    warnings: list[str] = Field(default_factory=list)


class CustomerRequestCreate(CustomerRequestBase):
    delivery_point_id: int | None = None
    # Ichkaridan kiritilganda korxona mijozlar ro'yxatidan tanlanadi.
    # Portaldan kelganda mijoz hali ro'yxatda bo'lmasligi mumkin.
    client_id: int | None = None
    # Ichki formada mijoz turi so'ralmaydi: korxona bizning ro'yxatimizdan
    # tanlanadi, ya'ni u har doim tizim tashkiloti. Portal esa turni o'zi
    # yuboradi -- u yerda tashqi mijoz ham bo'ladi.
    customer_type: CustomerType = CustomerType.internal_organization
    # Mijoz tanlangan bo'lsa, nom va rekvizitlar uning kartochkasidan
    # olinadi va bu yerda so'ralmaydi. Portaldan kelganda esa nom qo'lda
    # yoziladi va u majburiy bo'lib qoladi -- tekshiruv endpointda.
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=64)
    schedule: list[CustomerRequestScheduleCreate] = Field(default_factory=list)


class CustomerRequestUpdate(BaseModel):
    delivery_point_id: int | None = None
    client_id: int | None = None
    customer_type: CustomerType | None = None
    payment_source: PaymentSource | None = None
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = None
    region: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=64)
    contact_full_name: str | None = None
    contact_phone: str | None = None
    product_id: int | None = None
    total_quantity: Decimal | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    internal_comment: str | None = None
    rejection_reason: str | None = None
    schedule: list[CustomerRequestScheduleCreate] | None = None

    @field_validator("inn")
    @classmethod
    def inn_must_be_digits(cls, value: str | None) -> str | None:
        if value and not value.isdigit():
            raise ValueError("STIR faqat raqamlardan iborat bo'lishi kerak.")
        return value


class CustomerRequestStatusChange(BaseModel):
    status: CustomerRequestStatus
    comment: str | None = None
    rejection_reason: str | None = None
    changed_by: str | None = "operator"


class CustomerRequestListItem(BaseModel):
    id: int
    request_number: str
    customer_type: CustomerType
    customer_type_label: str
    payment_source: PaymentSource
    payment_source_label: str
    company_name: str
    inn: str | None = None
    phone: str | None = None
    product: ProductSummary
    total_quantity: Decimal
    unit: str
    status: CustomerRequestStatus
    status_label: str
    created_at: datetime


class CustomerRequestStatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    old_status: CustomerRequestStatus | None = None
    old_status_label: str | None = None
    new_status: CustomerRequestStatus
    new_status_label: str
    changed_by: str | None = None
    comment: str | None = None
    created_at: datetime


class StatusTransition(BaseModel):
    status: str
    label: str
    # forward advances the flow, backward undoes a step, reject closes it.
    direction: str
    requires_comment: bool


class CustomerRequestDetail(CustomerRequestListItem):
    delivery_point_id: int | None = None
    delivery_point: DeliveryPointSummary | None = None
    client_id: int | None = None
    region: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    contact_full_name: str | None = None
    contact_phone: str | None = None
    internal_comment: str | None = None
    rejection_reason: str | None = None
    reviewed_at: datetime | None = None
    contract_signed_at: datetime | None = None
    converted_to_order_at: datetime | None = None
    updated_at: datetime
    schedule: list[CustomerRequestScheduleRead] = Field(default_factory=list)
    status_history: list[CustomerRequestStatusHistoryRead] = Field(default_factory=list)
    # Which moves are legal from where this request stands. The browser renders
    # one button per entry instead of a fixed list, so it cannot offer a step
    # the server would refuse.
    available_transitions: list[StatusTransition] = Field(default_factory=list)
    can_convert_to_order: bool = False


CustomerRequestPage = Page[CustomerRequestListItem]
