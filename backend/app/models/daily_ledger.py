"""Kunlik provodka -- bir kunda bo'lgan barcha pul harakati.

Tizimda pul faqat hisob-faktura orqali ko'rinardi: mijoz to'lovi va
ta'minotchi to'lovi. Ish haqi, soliq, yoqilg'i, bank komissiyasi,
ijara -- ya'ni kompaniyaning kundalik xarajatlarining katta qismi hech
qayerda yozilmasdi. Shu sababli «bugun qancha pul kirdi va qayerga
ketdi» degan eng oddiy savolga tizim javob bera olmasdi.

Buxgalter kuniga bir marta bank ko'chirmasi bo'yicha shu jurnalni
to'ldiradi: kimdan nima uchun tushdi, kimga nima uchun chiqdi. Satrni
mijoz yoki ta'minotchiga bog'lash mumkin, lekin majburiy emas -- va
avtomatik to'lov yozuvi yaratilmaydi, aks holda bitta pul ikki joyda
hisoblanardi.

Kun yopilgach qulflanadi. Tuzatish uchun sabab bilan qayta ochiladi va
bu tarixga yoziladi: o'tgan oyning raqami sezdirmay o'zgarib ketmasligi
kerak.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class LedgerDirection(str, Enum):
    incoming = "incoming"
    outgoing = "outgoing"


class LedgerStatus(str, Enum):
    draft = "draft"
    closed = "closed"


class LedgerCategory(str, Enum):
    """Pul nima uchun kirgan yoki chiqqan.

    Ro'yxat ataylab qisqa: har bir modda buxgalter bir qarashda tanlay
    oladigan bo'lishi kerak. Mos kelmagani `other_income` /
    `other_expense` ga tushadi va izohda tushuntiriladi.
    """

    # Kirim
    customer_payment = "customer_payment"
    advance = "advance"
    loan_in = "loan_in"
    other_income = "other_income"
    # Chiqim
    supplier_payment = "supplier_payment"
    salary = "salary"
    tax = "tax"
    fuel = "fuel"
    transport = "transport"
    repair = "repair"
    utilities = "utilities"
    bank_fee = "bank_fee"
    loan_out = "loan_out"
    other_expense = "other_expense"


class DailyLedger(Base, TimestampMixin):
    __tablename__ = "daily_ledgers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Bir kunga bitta jurnal. Ikkinchisi ochilsa, kunlik jami ikkiga
    # bo'linib ketardi va qoldiq zanjiri uzilardi.
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    # Bank ko'chirmasidagi kun boshi qoldig'i. Yangi kun ochilganda
    # o'tgan kunning oxirgi qoldig'idan to'ldiriladi, lekin buxgalter
    # uni tuzata oladi -- ko'chirma hujjat, hisob esa hisob.
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    status: Mapped[LedgerStatus] = mapped_column(SAEnum(LedgerStatus), default=LedgerStatus.draft, nullable=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    closed_by: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    lines: Mapped[list["DailyLedgerLine"]] = relationship(
        back_populates="ledger", cascade="all, delete-orphan", order_by="DailyLedgerLine.id"
    )
    notes_history: Mapped[list["DailyLedgerNote"]] = relationship(
        back_populates="ledger", cascade="all, delete-orphan", order_by="DailyLedgerNote.id"
    )


class DailyLedgerLine(Base, TimestampMixin):
    __tablename__ = "daily_ledger_lines"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("daily_ledgers.id", ondelete="CASCADE"), index=True)
    direction: Mapped[LedgerDirection] = mapped_column(SAEnum(LedgerDirection), nullable=False, index=True)
    category: Mapped[LedgerCategory] = mapped_column(SAEnum(LedgerCategory), nullable=False, index=True)
    # Kimdan yoki kimga. Matn -- chunki pul kartochkasi bo'lmagan
    # tomonga ham ketadi: soliq inspeksiyasi, bank, xodim.
    counterparty: Mapped[str] = mapped_column(String(255), nullable=False)
    # Kartochka bor bo'lsa bog'lanadi: keyin mijoz bo'yicha kesim
    # olinadi. Majburiy emas.
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"), index=True)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    bank_account: Mapped[str | None] = mapped_column(String(255))
    reference_number: Mapped[str | None] = mapped_column(String(255), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))

    ledger: Mapped[DailyLedger] = relationship(back_populates="lines")
    client: Mapped["Client | None"] = relationship()
    supplier: Mapped["Supplier | None"] = relationship()


class DailyLedgerNote(Base):
    __tablename__ = "daily_ledger_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("daily_ledgers.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    ledger: Mapped[DailyLedger] = relationship(back_populates="notes_history")
