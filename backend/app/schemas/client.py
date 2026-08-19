import re
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from backend.app.models.client import AddressType, DocumentType


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# The shapes the browser also checks. Repeating them here is the point: the
# HTML attributes are a convenience and can be bypassed by anything that talks
# to the API directly, so this is where the rule actually holds.
#
# Every rule below was checked against the existing 267 clients first -- all of
# them already match, so nobody is locked out of editing a record they could
# edit yesterday.
DIGIT_RULES = {
    "inn": (9, "STIR 9 ta raqamdan iborat bo'lishi kerak."),
    "oked": (5, "OKED 5 ta raqamdan iborat bo'lishi kerak."),
    "mfo": (5, "MFO 5 ta raqamdan iborat bo'lishi kerak."),
    "account_number": (20, "Hisob raqami 20 ta raqamdan iborat bo'lishi kerak."),
}
PHONE_RE = re.compile(r"^\+998\d{9}$")
PHONE_MESSAGE = "Telefon raqami +998 bilan boshlanib, 9 ta raqam bilan davom etishi kerak."


def blank_to_none(value: str | None) -> str | None:
    """An untouched optional field arrives as "", which is not a value."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def check_digits(field: str, value: str | None) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    # Spaces and dashes are how people paste these from documents; accept the
    # typing habit and store the canonical form.
    cleaned = re.sub(r"[\s-]", "", value)
    length, message = DIGIT_RULES[field]
    if not cleaned.isdigit() or len(cleaned) != length:
        raise ValueError(message)
    return cleaned


def check_phone(value: str | None) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    cleaned = re.sub(r"[\s()-]", "", value)
    if cleaned.startswith("998"):
        cleaned = f"+{cleaned}"
    elif len(cleaned) == 9 and cleaned.isdigit():
        cleaned = f"+998{cleaned}"
    if not PHONE_RE.match(cleaned):
        raise ValueError(PHONE_MESSAGE)
    return cleaned


def check_coordinate(value: str | None, limit: int, label: str) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    try:
        number = float(value.replace(",", "."))
    except ValueError:
        raise ValueError(f"{label} son bo'lishi kerak.") from None
    if not -limit <= number <= limit:
        raise ValueError(f"{label} -{limit} va {limit} orasida bo'lishi kerak.")
    return str(number)


class ClientIdentifiersMixin(BaseModel):
    """Shared by the create and update shapes of every client-side model.

    Deliberately mixed into the Create and Update classes only, never into the
    Base classes the Read schemas extend. Validating on the way *out* means a
    row that predates the rule -- or that was written before it existed -- makes
    its own record unopenable: a 27-digit account number on one client turned
    GET /api/clients/85 into a 500, so the card could not even be viewed to fix
    it. Input is the place to refuse bad data; output has to show what is
    stored, whatever it is.
    """

    @field_validator("inn", "oked", "mfo", "account_number", check_fields=False)
    @classmethod
    def _digits(cls, value, info):
        return check_digits(info.field_name, value)

    @field_validator("phone", check_fields=False)
    @classmethod
    def _phone(cls, value):
        return check_phone(value)

    @field_validator("latitude", check_fields=False)
    @classmethod
    def _latitude(cls, value):
        return check_coordinate(value, 90, "Kenglik")

    @field_validator("longitude", check_fields=False)
    @classmethod
    def _longitude(cls, value):
        return check_coordinate(value, 180, "Uzunlik")


class ClientBulkDelete(BaseModel):
    """Ids for a bulk delete. Capped so a stray request cannot walk the table."""

    ids: list[int] = Field(min_length=1, max_length=200)


class ClientContactBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    position: str | None = Field(default=None, max_length=120)
    phone: str | None = None
    email: EmailStr | None = None
    is_primary: bool = False
    comment: str | None = None


class ClientContactCreate(ClientContactBase, ClientIdentifiersMixin):
    pass


class ClientContactUpdate(ClientIdentifiersMixin):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    position: str | None = Field(default=None, max_length=120)
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
    region: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    comment: str | None = None


class ClientAddressCreate(ClientAddressBase, ClientIdentifiersMixin):
    pass


class ClientAddressUpdate(ClientIdentifiersMixin):
    address_type: AddressType | None = None
    region: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
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


class ClientBankAccountCreate(ClientBankAccountBase, ClientIdentifiersMixin):
    pass


class ClientBankAccountUpdate(ClientIdentifiersMixin):
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


class ClientCreate(ClientBase, ClientIdentifiersMixin):
    first_contact: ClientContactCreate | None = None
    address: ClientAddressCreate | None = None
    bank_account: ClientBankAccountCreate | None = None


class ClientUpdate(ClientIdentifiersMixin):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = None
    oked: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None
    # The edit form shows the client together with its primary contact, address
    # and bank account, so it can send them together. Previously it fired four
    # separate requests and a failure on the third left the first two already
    # written, with nothing said about it.
    first_contact: ClientContactUpdate | None = None
    address: ClientAddressUpdate | None = None
    bank_account: ClientBankAccountUpdate | None = None


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
    active_contracts: int | None = None
    active_orders: int | None = None
