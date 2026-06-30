from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from backend.app.models.client import AddressType, DocumentType


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ClientContactBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    position: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_primary: bool = False
    comment: str | None = None


class ClientContactCreate(ClientContactBase):
    pass


class ClientContactUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    position: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    is_primary: bool | None = None
    comment: str | None = None


class ClientContactRead(ClientContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    created_at: datetime
    updated_at: datetime


class ClientAddressBase(BaseModel):
    address_type: AddressType
    region: str | None = None
    district: str | None = None
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    comment: str | None = None


class ClientAddressCreate(ClientAddressBase):
    pass


class ClientAddressUpdate(BaseModel):
    address_type: AddressType | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    comment: str | None = None


class ClientAddressRead(ClientAddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    created_at: datetime
    updated_at: datetime


class ClientBankAccountBase(BaseModel):
    bank_name: str = Field(min_length=1, max_length=255)
    mfo: str | None = None
    account_number: str | None = None
    is_primary: bool = False
    comment: str | None = None


class ClientBankAccountCreate(ClientBankAccountBase):
    pass


class ClientBankAccountUpdate(BaseModel):
    bank_name: str | None = Field(default=None, min_length=1, max_length=255)
    mfo: str | None = None
    account_number: str | None = None
    is_primary: bool | None = None
    comment: str | None = None


class ClientBankAccountRead(ClientBankAccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    created_at: datetime
    updated_at: datetime


class ClientDocumentBase(BaseModel):
    document_type: DocumentType
    title: str = Field(min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class ClientDocumentCreate(ClientDocumentBase):
    pass


class ClientDocumentUpdate(BaseModel):
    document_type: DocumentType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    file_url: str | None = None
    uploaded_by: str | None = None


class ClientDocumentRead(ClientDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    uploaded_at: datetime


class ClientNoteBase(BaseModel):
    note: str = Field(min_length=1)
    created_by: str | None = None


class ClientNoteCreate(ClientNoteBase):
    pass


class ClientNoteUpdate(BaseModel):
    note: str | None = Field(default=None, min_length=1)
    created_by: str | None = None


class ClientNoteRead(ClientNoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    created_at: datetime


class ClientBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    inn: str | None = None
    oked: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None


class ClientCreate(ClientBase):
    first_contact: ClientContactCreate | None = None
    address: ClientAddressCreate | None = None
    bank_account: ClientBankAccountCreate | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = None
    oked: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ClientListItem(ClientRead):
    primary_contact: ClientContactRead | None = None
    primary_region: str | None = None
    legal_address: str | None = None
    active_contracts: int | None = None
    active_orders: int | None = None
    last_activity: datetime | None = None


class ClientDetail(ClientRead):
    contacts: list[ClientContactRead] = Field(default_factory=list)
    addresses: list[ClientAddressRead] = Field(default_factory=list)
    bank_accounts: list[ClientBankAccountRead] = Field(default_factory=list)
    documents: list[ClientDocumentRead] = Field(default_factory=list)
    notes_history: list[ClientNoteRead] = Field(default_factory=list)
