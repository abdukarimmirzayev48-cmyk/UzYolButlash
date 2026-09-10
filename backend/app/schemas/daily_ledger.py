from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.daily_ledger import LedgerCategory, LedgerDirection, LedgerStatus


class DailyLedgerLineBase(BaseModel):
    direction: LedgerDirection
    category: LedgerCategory
    counterparty: str = Field(min_length=1, max_length=255)
    client_id: int | None = None
    supplier_id: int | None = None
    purpose: str = Field(min_length=1)
    amount: Decimal
    bank_account: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class DailyLedgerLineCreate(DailyLedgerLineBase):
    # Nol summali satr jurnalda hech narsa anglatmaydi, lekin kunlik
    # jamini tekshirayotgan odamni chalg'itadi.
    amount: Decimal = Field(gt=0)


class DailyLedgerLineUpdate(BaseModel):
    direction: LedgerDirection | None = None
    category: LedgerCategory | None = None
    counterparty: str | None = Field(default=None, min_length=1, max_length=255)
    client_id: int | None = None
    supplier_id: int | None = None
    purpose: str | None = Field(default=None, min_length=1)
    amount: Decimal | None = Field(default=None, gt=0)
    bank_account: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class DailyLedgerLineRead(DailyLedgerLineBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ledger_id: int
    client_name: str | None = None
    supplier_name: str | None = None
    created_by: str | None = None
    created_at: datetime


class DailyLedgerNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    note: str
    created_by: str | None = None
    created_at: datetime


class DailyLedgerCreate(BaseModel):
    entry_date: date
    # Berilmasa, o'tgan kunning oxirgi qoldig'idan olinadi.
    opening_balance: Decimal | None = None
    notes: str | None = None


class DailyLedgerUpdate(BaseModel):
    opening_balance: Decimal | None = None
    notes: str | None = None


class DailyLedgerClose(BaseModel):
    notes: str | None = None
    # Kun boshi qoldig'i o'tgan kunning oxiriga mos kelmasa yoki jurnal
    # bo'sh bo'lsa, buxgalter buni ataylab tasdiqlaydi.
    allow_balance_mismatch: bool = False
    allow_empty: bool = False


class DailyLedgerReopen(BaseModel):
    reason: str = Field(min_length=1)


class DailyLedgerSummary(BaseModel):
    total_incoming: Decimal
    total_outgoing: Decimal
    closing_balance: Decimal
    lines_count: int
    # O'tgan kunning oxirgi qoldig'i. Kun boshi undan farq qilsa,
    # oradagi kunda satr tushib qolgan degani.
    previous_closing_balance: Decimal | None = None
    balance_mismatch: Decimal | None = None


class DailyLedgerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_date: date
    opening_balance: Decimal
    status: LedgerStatus
    closed_at: datetime | None = None
    closed_by: str | None = None
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    summary: DailyLedgerSummary


class DailyLedgerDetail(DailyLedgerRead):
    lines: list[DailyLedgerLineRead] = Field(default_factory=list)
    notes_history: list[DailyLedgerNoteRead] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DailyLedgerList(BaseModel):
    items: list[DailyLedgerRead]
    total: int
    page: int
    page_size: int
    # Ro'yxatdagi (filtrlangan) kunlarning jami.
    total_incoming: Decimal
    total_outgoing: Decimal


class LedgerCategoryTotal(BaseModel):
    category: LedgerCategory
    direction: LedgerDirection
    amount: Decimal
    lines_count: int


class LedgerOverview(BaseModel):
    """Davr bo'yicha kesim: qaysi moddaga qancha ketgan."""

    date_from: date | None = None
    date_to: date | None = None
    total_incoming: Decimal
    total_outgoing: Decimal
    net: Decimal
    days_count: int
    open_days: int
    categories: list[LedgerCategoryTotal] = Field(default_factory=list)
