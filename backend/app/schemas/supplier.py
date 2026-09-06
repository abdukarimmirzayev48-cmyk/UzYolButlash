from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from backend.app.models.supplier import SupplierAddressType, SupplierDocumentType


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
