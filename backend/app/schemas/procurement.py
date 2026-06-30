from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from backend.app.models.procurement import ProcurementDocumentType, ProcurementStatus, SupplierAddressType, SupplierDocumentType, SupplierOfferStatus
from backend.app.schemas.client import ClientRead
from backend.app.schemas.contract import ContractRead
from backend.app.schemas.order import OrderRead


class SupplierContactBase(BaseModel):
    full_name: str = Field(min_length=1)
    position: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_primary: bool = False
    comment: str | None = None


class SupplierContactRead(SupplierContactBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    created_at: datetime
    updated_at: datetime


class SupplierContactUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1)
    position: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_primary: bool | None = None
    comment: str | None = None


class SupplierAddressBase(BaseModel):
    address_type: SupplierAddressType
    region: str | None = None
    district: str | None = None
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    comment: str | None = None


class SupplierAddressRead(SupplierAddressBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    created_at: datetime
    updated_at: datetime


class SupplierAddressUpdate(BaseModel):
    address_type: SupplierAddressType | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    comment: str | None = None


class SupplierBankAccountBase(BaseModel):
    bank_name: str = Field(min_length=1)
    mfo: str | None = None
    account_number: str | None = None
    is_primary: bool = False
    comment: str | None = None


class SupplierBankAccountRead(SupplierBankAccountBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    created_at: datetime
    updated_at: datetime


class SupplierBankAccountUpdate(BaseModel):
    bank_name: str | None = Field(default=None, min_length=1)
    mfo: str | None = None
    account_number: str | None = None
    is_primary: bool | None = None
    comment: str | None = None


class SupplierDocumentCreate(BaseModel):
    document_type: SupplierDocumentType
    title: str = Field(min_length=1)
    file_url: str | None = None
    uploaded_by: str | None = None


class SupplierDocumentUpdate(BaseModel):
    document_type: SupplierDocumentType | None = None
    title: str | None = Field(default=None, min_length=1)
    file_url: str | None = None
    uploaded_by: str | None = None


class SupplierDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    document_type: SupplierDocumentType
    title: str
    file_url: str | None
    uploaded_by: str | None
    uploaded_at: datetime


class SupplierNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_id: int
    note: str
    created_by: str | None
    created_at: datetime


class SupplierNoteCreate(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class SupplierNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1)
    inn: str | None = None
    oked: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None
    first_contact: SupplierContactBase | None = None
    address: SupplierAddressBase | None = None
    bank_account: SupplierBankAccountBase | None = None


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    inn: str | None = None
    oked: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    inn: str | None
    oked: str | None
    phone: str | None
    email: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class SupplierListItem(SupplierRead):
    primary_contact: SupplierContactRead | None = None
    primary_region: str | None = None
    primary_loading_address: str | None = None
    last_activity: datetime | None = None


class SupplierDetail(SupplierRead):
    contacts: list[SupplierContactRead] = Field(default_factory=list)
    addresses: list[SupplierAddressRead] = Field(default_factory=list)
    bank_accounts: list[SupplierBankAccountRead] = Field(default_factory=list)
    documents: list[SupplierDocumentRead] = Field(default_factory=list)
    notes_history: list[SupplierNoteRead] = Field(default_factory=list)


class ProcurementItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    procurement_id: int
    order_item_id: int
    contract_item_id: int
    product_name: str
    unit: str
    required_quantity: Decimal
    purchased_quantity: Decimal
    created_at: datetime
    updated_at: datetime


class SupplierOfferItemCreate(BaseModel):
    procurement_item_id: int
    offered_quantity: Decimal = Field(gt=0)
    selected_quantity: Decimal = Decimal("0")
    unit_price: Decimal = Field(ge=0)
    vat_rate: Decimal = Decimal("12")
    transport_included: bool = False
    delivery_terms: str | None = None
    ready_date: date | None = None


class SupplierOfferItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    supplier_offer_id: int
    procurement_item_id: int
    order_item_id: int
    contract_item_id: int
    product_name: str
    unit: str
    offered_quantity: Decimal
    selected_quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal
    vat_rate: Decimal
    vat_amount: Decimal
    total_with_vat: Decimal
    transport_included: bool
    delivery_terms: str | None
    ready_date: date | None
    is_selected: bool
    created_at: datetime
    updated_at: datetime


class SupplierOfferCreate(BaseModel):
    supplier_id: int | None = None
    supplier_name: str = Field(min_length=1)
    offer_number: str = Field(min_length=1)
    offer_date: date
    valid_until: date | None = None
    status: SupplierOfferStatus = SupplierOfferStatus.received
    currency: str = "UZS"
    transport_included: bool = False
    delivery_terms: str | None = None
    estimated_delivery_cost: Decimal = Decimal("0")
    ready_date: date | None = None
    payment_terms: str | None = None
    notes: str | None = None
    is_selected: bool = False
    created_by: str | None = None
    items: list[SupplierOfferItemCreate] = Field(default_factory=list)


class SupplierOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    procurement_id: int
    supplier_id: int | None
    supplier_name: str
    offer_number: str
    offer_date: date
    valid_until: date | None
    status: SupplierOfferStatus
    currency: str
    total_product_amount: Decimal
    total_vat_amount: Decimal
    transport_included: bool
    delivery_terms: str | None
    estimated_delivery_cost: Decimal
    total_amount: Decimal
    ready_date: date | None
    payment_terms: str | None
    notes: str | None
    is_selected: bool
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    items: list[SupplierOfferItemRead] = Field(default_factory=list)


class ProcurementDocumentCreate(BaseModel):
    supplier_offer_id: int | None = None
    document_type: ProcurementDocumentType
    title: str = Field(min_length=1)
    file_url: str | None = None
    uploaded_by: str | None = None


class ProcurementDocumentUpdate(BaseModel):
    supplier_offer_id: int | None = None
    document_type: ProcurementDocumentType | None = None
    title: str | None = Field(default=None, min_length=1)
    file_url: str | None = None
    uploaded_by: str | None = None


class ProcurementDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    procurement_id: int
    supplier_offer_id: int | None
    document_type: ProcurementDocumentType
    title: str
    file_url: str | None
    uploaded_by: str | None
    uploaded_at: datetime


class ProcurementNoteCreate(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class ProcurementNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class ProcurementNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    procurement_id: int
    note: str
    created_by: str | None
    created_at: datetime


class ProcurementCreate(BaseModel):
    order_id: int
    procurement_number: str | None = None
    procurement_date: date | None = None
    required_date: date | None = None
    status: ProcurementStatus = ProcurementStatus.draft
    notes: str | None = None
    created_by: str | None = None


class ProcurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: int
    contract_id: int
    client_id: int
    procurement_number: str
    procurement_date: date
    required_date: date | None
    status: ProcurementStatus
    source_type: str
    fulfillment_type: str
    currency: str
    estimated_purchase_amount: Decimal
    final_purchase_amount: Decimal
    notes: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class ProcurementSummary(BaseModel):
    required_quantity: Decimal
    selected_quantity: Decimal
    remaining_quantity: Decimal
    offers_count: int
    selected_suppliers_count: int
    final_purchase_amount: Decimal


class ProcurementListItem(ProcurementRead):
    client: ClientRead
    contract: ContractRead
    order: OrderRead
    product: str | None = None
    required_quantity: Decimal
    selected_quantity: Decimal
    selected_suppliers_count: int


class ProcurementDetail(ProcurementRead):
    client: ClientRead
    contract: ContractRead
    order: OrderRead
    items: list[ProcurementItemRead] = Field(default_factory=list)
    offers: list[SupplierOfferRead] = Field(default_factory=list)
    documents: list[ProcurementDocumentRead] = Field(default_factory=list)
    notes_history: list[ProcurementNoteRead] = Field(default_factory=list)
    summary: ProcurementSummary | None = None
