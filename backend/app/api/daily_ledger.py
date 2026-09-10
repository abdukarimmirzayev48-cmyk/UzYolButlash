"""Kunlik provodka API.

Qoidalar bitta joyda: yopilgan kunga yozib bo'lmaydi, kun boshi qoldig'i
o'tgan kunning oxiridan ko'chadi, kun yopilishidan oldin zanjir
tekshiriladi.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.daily_ledger import (
    DailyLedger,
    DailyLedgerLine,
    DailyLedgerNote,
    LedgerCategory,
    LedgerDirection,
    LedgerStatus,
)
from backend.app.models.supplier import Supplier
from backend.app.models.user import User
from backend.app.schemas.daily_ledger import (
    DailyLedgerClose,
    DailyLedgerCreate,
    DailyLedgerDetail,
    DailyLedgerLineCreate,
    DailyLedgerLineUpdate,
    DailyLedgerList,
    DailyLedgerReopen,
    DailyLedgerUpdate,
    LedgerCategoryTotal,
    LedgerOverview,
)
from backend.app.services.auth import get_current_user, require_edit

router = APIRouter(prefix="/api/daily-ledgers", tags=["daily-ledgers"])
lines_router = APIRouter(prefix="/api/daily-ledger-lines", tags=["daily-ledgers"])

MSG_LEDGER_NOT_FOUND = "Kunlik provodka topilmadi."
MSG_LINE_NOT_FOUND = "Provodka satri topilmadi."
MSG_CLOSED = "Kun yopilgan. O'zgartirish uchun avval kunni qayta oching."
MSG_DUPLICATE_DATE = "Bu sanaga provodka allaqachon ochilgan."
MSG_FUTURE_DATE = "Kelajakdagi sanaga provodka ochib bo'lmaydi."
MSG_ALREADY_CLOSED = "Bu kun allaqachon yopilgan."
MSG_NOT_CLOSED = "Bu kun ochiq turibdi."
MSG_EMPTY = "Jurnalda birorta satr yo'q."
MSG_BALANCE_MISMATCH = "Kun boshi qoldig'i o'tgan kunning oxirgi qoldig'iga mos emas"
MSG_COUNTERPARTY_SIDE = "Bitta satrda ham mijoz, ham ta'minotchi ko'rsatilgan."
MSG_CLIENT_NOT_FOUND = "Mijoz topilmadi."
MSG_SUPPLIER_NOT_FOUND = "Ta'minotchi topilmadi."

# Qaysi modda qaysi tomonga tegishli. Kirim moddasini chiqimga qo'yish
# davr kesimini ma'nosiz qiladi -- «ish haqi kirimi» degan narsa yo'q.
INCOMING_CATEGORIES = {
    LedgerCategory.customer_payment,
    LedgerCategory.advance,
    LedgerCategory.loan_in,
    LedgerCategory.other_income,
}
OUTGOING_CATEGORIES = {
    LedgerCategory.supplier_payment,
    LedgerCategory.salary,
    LedgerCategory.tax,
    LedgerCategory.fuel,
    LedgerCategory.transport,
    LedgerCategory.repair,
    LedgerCategory.utilities,
    LedgerCategory.bank_fee,
    LedgerCategory.loan_out,
    LedgerCategory.other_expense,
}
MSG_CATEGORY_SIDE = "Modda tanlangan yo'nalishga to'g'ri kelmaydi."


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))


def spaced(value) -> str:
    """Tarix yozuvidagi summa. Xom `120000000.00` o'qilmaydi -- tarix esa
    aynan odam o'qishi uchun yoziladi."""
    return f"{Decimal(value or 0):,.2f}".replace(",", " ")


def load_ledger(db: Session, ledger_id: int) -> DailyLedger:
    ledger = db.scalars(
        select(DailyLedger)
        .where(DailyLedger.id == ledger_id)
        .options(
            selectinload(DailyLedger.lines).selectinload(DailyLedgerLine.client),
            selectinload(DailyLedger.lines).selectinload(DailyLedgerLine.supplier),
            selectinload(DailyLedger.notes_history),
        )
    ).first()
    if not ledger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_LEDGER_NOT_FOUND)
    return ledger


def guard_open(ledger: DailyLedger) -> None:
    if ledger.status == LedgerStatus.closed:
        raise HTTPException(status_code=422, detail=MSG_CLOSED)


def totals_of(ledger: DailyLedger) -> tuple[Decimal, Decimal]:
    incoming = sum(
        (Decimal(line.amount or 0) for line in ledger.lines if line.direction == LedgerDirection.incoming),
        Decimal("0"),
    )
    outgoing = sum(
        (Decimal(line.amount or 0) for line in ledger.lines if line.direction == LedgerDirection.outgoing),
        Decimal("0"),
    )
    return money(incoming), money(outgoing)


def previous_closing(db: Session, entry_date: date, exclude_id: int | None = None) -> Decimal | None:
    """O'tgan kunning oxirgi qoldig'i.

    «O'tgan kun» -- kalendar bo'yicha kechagi emas, jurnaldagi eng
    yaqin oldingi kun: dam olish kunlarida provodka ochilmaydi.
    """
    stmt = select(DailyLedger).where(DailyLedger.entry_date < entry_date)
    if exclude_id:
        stmt = stmt.where(DailyLedger.id != exclude_id)
    previous = db.scalars(
        stmt.options(selectinload(DailyLedger.lines)).order_by(DailyLedger.entry_date.desc()).limit(1)
    ).first()
    if not previous:
        return None
    incoming, outgoing = totals_of(previous)
    return money(Decimal(previous.opening_balance or 0) + incoming - outgoing)


def summary_of(db: Session, ledger: DailyLedger) -> dict:
    incoming, outgoing = totals_of(ledger)
    opening = money(ledger.opening_balance)
    previous = previous_closing(db, ledger.entry_date, exclude_id=ledger.id)
    mismatch = None if previous is None else money(opening - previous)
    return {
        "total_incoming": incoming,
        "total_outgoing": outgoing,
        "closing_balance": money(opening + incoming - outgoing),
        "lines_count": len(ledger.lines),
        "previous_closing_balance": previous,
        "balance_mismatch": mismatch if mismatch else None,
    }


def line_payload(line: DailyLedgerLine) -> dict:
    return {
        "id": line.id,
        "ledger_id": line.ledger_id,
        "direction": line.direction,
        "category": line.category,
        "counterparty": line.counterparty,
        "client_id": line.client_id,
        "supplier_id": line.supplier_id,
        "client_name": line.client.name if line.client else None,
        "supplier_name": line.supplier.name if line.supplier else None,
        "purpose": line.purpose,
        "amount": money(line.amount),
        "bank_account": line.bank_account,
        "reference_number": line.reference_number,
        "notes": line.notes,
        "created_by": line.created_by,
        "created_at": line.created_at,
    }


def ledger_warnings(summary: dict, ledger: DailyLedger) -> list[str]:
    warnings: list[str] = []
    if summary["balance_mismatch"]:
        # Yorliq alohida qism bo'lishi kerak: brauzer uni lug'atdan
        # qidiradi, qiymat esa tegilmay qoladi.
        warnings.append(f"{MSG_BALANCE_MISMATCH}: {summary['balance_mismatch']}")
    if not ledger.lines:
        warnings.append(MSG_EMPTY)
    return warnings


def detail_payload(db: Session, ledger: DailyLedger) -> dict:
    summary = summary_of(db, ledger)
    return {
        "id": ledger.id,
        "entry_date": ledger.entry_date,
        "opening_balance": money(ledger.opening_balance),
        "status": ledger.status,
        "closed_at": ledger.closed_at,
        "closed_by": ledger.closed_by,
        "notes": ledger.notes,
        "created_by": ledger.created_by,
        "created_at": ledger.created_at,
        "updated_at": ledger.updated_at,
        "summary": summary,
        "lines": [line_payload(line) for line in ledger.lines],
        "notes_history": ledger.notes_history,
        "warnings": ledger_warnings(summary, ledger),
    }


def apply_line(db: Session, line: DailyLedgerLine, data: dict) -> None:
    for key, value in data.items():
        setattr(line, key, value)
    # Bitta pul harakati bir vaqtda ham mijozdan, ham ta'minotchidan
    # bo'lishi mumkin emas -- bunday satr keyin ikkala kesimda ham
    # ko'rinib, jamini ikki marta ko'rsatardi.
    if line.client_id and line.supplier_id:
        raise HTTPException(status_code=422, detail=MSG_COUNTERPARTY_SIDE)
    if line.client_id and not db.get(Client, line.client_id):
        raise HTTPException(status_code=422, detail=MSG_CLIENT_NOT_FOUND)
    if line.supplier_id and not db.get(Supplier, line.supplier_id):
        raise HTTPException(status_code=422, detail=MSG_SUPPLIER_NOT_FOUND)
    allowed = INCOMING_CATEGORIES if line.direction == LedgerDirection.incoming else OUTGOING_CATEGORIES
    if line.category not in allowed:
        raise HTTPException(status_code=422, detail=MSG_CATEGORY_SIDE)


# --- Ro'yxat va kesim (literal yo'llar /{id} dan oldin) ---


@router.get("", response_model=DailyLedgerList)
def list_ledgers(
    db: Session = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
    ledger_status: LedgerStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = select(DailyLedger).options(selectinload(DailyLedger.lines))
    if date_from:
        stmt = stmt.where(DailyLedger.entry_date >= date_from)
    if date_to:
        stmt = stmt.where(DailyLedger.entry_date <= date_to)
    if ledger_status:
        stmt = stmt.where(DailyLedger.status == ledger_status)
    rows = list(db.scalars(stmt.order_by(DailyLedger.entry_date.desc())))
    total = len(rows)
    page_rows = rows[(page - 1) * page_size: page * page_size]

    incoming_total = Decimal("0")
    outgoing_total = Decimal("0")
    for row in rows:
        incoming, outgoing = totals_of(row)
        incoming_total += incoming
        outgoing_total += outgoing

    items = []
    for row in page_rows:
        summary = summary_of(db, row)
        items.append({
            "id": row.id,
            "entry_date": row.entry_date,
            "opening_balance": money(row.opening_balance),
            "status": row.status,
            "closed_at": row.closed_at,
            "closed_by": row.closed_by,
            "notes": row.notes,
            "created_by": row.created_by,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "summary": summary,
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_incoming": money(incoming_total),
        "total_outgoing": money(outgoing_total),
    }


@router.get("/overview", response_model=LedgerOverview)
def ledger_overview(
    db: Session = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Davr kesimi: qaysi moddaga qancha kirgan va chiqqan."""
    stmt = select(DailyLedger).options(selectinload(DailyLedger.lines))
    if date_from:
        stmt = stmt.where(DailyLedger.entry_date >= date_from)
    if date_to:
        stmt = stmt.where(DailyLedger.entry_date <= date_to)
    ledgers = list(db.scalars(stmt))

    buckets: dict[tuple[LedgerCategory, LedgerDirection], list[Decimal]] = {}
    incoming_total = Decimal("0")
    outgoing_total = Decimal("0")
    for ledger in ledgers:
        for line in ledger.lines:
            amount = Decimal(line.amount or 0)
            key = (line.category, line.direction)
            bucket = buckets.setdefault(key, [Decimal("0"), Decimal("0")])
            bucket[0] += amount
            bucket[1] += 1
            if line.direction == LedgerDirection.incoming:
                incoming_total += amount
            else:
                outgoing_total += amount

    categories = [
        LedgerCategoryTotal(category=key[0], direction=key[1], amount=money(value[0]), lines_count=int(value[1]))
        for key, value in buckets.items()
    ]
    categories.sort(key=lambda row: row.amount, reverse=True)
    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_incoming": money(incoming_total),
        "total_outgoing": money(outgoing_total),
        "net": money(incoming_total - outgoing_total),
        "days_count": len(ledgers),
        "open_days": sum(1 for ledger in ledgers if ledger.status == LedgerStatus.draft),
        "categories": categories,
    }


@router.get("/next-date", response_model=DailyLedgerCreate)
def next_ledger_date(db: Session = Depends(get_db)):
    """Yangi kun uchun tayyor sana va qoldiq.

    Forma shu qiymatlar bilan ochiladi: buxgalter qoldiqni qo'lda
    ko'chirmaydi va shu bilan zanjir uzilmaydi.
    """
    last = db.scalars(select(DailyLedger).order_by(DailyLedger.entry_date.desc()).limit(1)).first()
    today = date.today()
    suggested = today if not last else min(last.entry_date + timedelta(days=1), today)
    return {
        "entry_date": suggested,
        "opening_balance": previous_closing(db, suggested),
        "notes": None,
    }


@router.post("", response_model=DailyLedgerDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("moliya"))])
def create_ledger(payload: DailyLedgerCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.entry_date > date.today():
        raise HTTPException(status_code=422, detail=MSG_FUTURE_DATE)
    if db.scalar(select(func.count()).select_from(DailyLedger).where(DailyLedger.entry_date == payload.entry_date)):
        raise HTTPException(status_code=422, detail=MSG_DUPLICATE_DATE)
    opening = payload.opening_balance
    if opening is None:
        opening = previous_closing(db, payload.entry_date) or Decimal("0")
    ledger = DailyLedger(
        entry_date=payload.entry_date,
        opening_balance=money(opening),
        notes=payload.notes,
        created_by=getattr(user, "username", None),
    )
    db.add(ledger)
    db.commit()
    return detail_payload(db, load_ledger(db, ledger.id))


@router.get("/{ledger_id}", response_model=DailyLedgerDetail)
def get_ledger(ledger_id: int, db: Session = Depends(get_db)):
    return detail_payload(db, load_ledger(db, ledger_id))


@router.patch("/{ledger_id}", response_model=DailyLedgerDetail, dependencies=[Depends(require_edit("moliya"))])
def update_ledger(ledger_id: int, payload: DailyLedgerUpdate, db: Session = Depends(get_db)):
    ledger = load_ledger(db, ledger_id)
    guard_open(ledger)
    data = payload.model_dump(exclude_unset=True)
    if "opening_balance" in data and data["opening_balance"] is not None:
        ledger.opening_balance = money(data["opening_balance"])
    if "notes" in data:
        ledger.notes = data["notes"]
    db.commit()
    return detail_payload(db, load_ledger(db, ledger_id))


@router.delete("/{ledger_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("moliya"))])
def delete_ledger(ledger_id: int, db: Session = Depends(get_db)):
    ledger = load_ledger(db, ledger_id)
    guard_open(ledger)
    db.delete(ledger)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{ledger_id}/lines", response_model=DailyLedgerDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("moliya"))])
def add_line(ledger_id: int, payload: DailyLedgerLineCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ledger = load_ledger(db, ledger_id)
    guard_open(ledger)
    line = DailyLedgerLine(ledger_id=ledger.id, created_by=getattr(user, "username", None))
    data = payload.model_dump()
    data["amount"] = money(data["amount"])
    apply_line(db, line, data)
    db.add(line)
    db.commit()
    return detail_payload(db, load_ledger(db, ledger_id))


@router.post("/{ledger_id}/close", response_model=DailyLedgerDetail, dependencies=[Depends(require_edit("moliya"))])
def close_ledger(ledger_id: int, payload: DailyLedgerClose, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ledger = load_ledger(db, ledger_id)
    if ledger.status == LedgerStatus.closed:
        raise HTTPException(status_code=422, detail=MSG_ALREADY_CLOSED)
    summary = summary_of(db, ledger)
    if not ledger.lines and not payload.allow_empty:
        raise HTTPException(status_code=409, detail=MSG_EMPTY)
    if summary["balance_mismatch"] and not payload.allow_balance_mismatch:
        raise HTTPException(status_code=409, detail=f"{MSG_BALANCE_MISMATCH}: {summary['balance_mismatch']}")

    ledger.status = LedgerStatus.closed
    ledger.closed_at = datetime.now()
    ledger.closed_by = getattr(user, "username", None)
    note_parts = [f"Kun yopildi. Kirim: {spaced(summary['total_incoming'])}"
                  f" · Chiqim: {spaced(summary['total_outgoing'])}"
                  f" · Kun oxiri: {spaced(summary['closing_balance'])}"]
    if summary["balance_mismatch"]:
        note_parts.append(f"{MSG_BALANCE_MISMATCH}: {summary['balance_mismatch']}")
    if payload.notes:
        note_parts.append(payload.notes)
        ledger.notes = payload.notes
    db.add(DailyLedgerNote(ledger_id=ledger.id, note="\n".join(note_parts), created_by=getattr(user, "username", None)))
    db.commit()
    return detail_payload(db, load_ledger(db, ledger_id))


@router.post("/{ledger_id}/reopen", response_model=DailyLedgerDetail, dependencies=[Depends(require_edit("moliya"))])
def reopen_ledger(ledger_id: int, payload: DailyLedgerReopen, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ledger = load_ledger(db, ledger_id)
    if ledger.status != LedgerStatus.closed:
        raise HTTPException(status_code=422, detail=MSG_NOT_CLOSED)
    ledger.status = LedgerStatus.draft
    ledger.closed_at = None
    ledger.closed_by = None
    # Sabab majburiy: yopilgan kun ochilishi tekshiruvchi uchun voqea,
    # va u nima uchun bo'lganini bilishi kerak.
    db.add(DailyLedgerNote(
        ledger_id=ledger.id,
        note=f"Kun qayta ochildi. Sabab: {payload.reason}",
        created_by=getattr(user, "username", None),
    ))
    db.commit()
    return detail_payload(db, load_ledger(db, ledger_id))


# --- Satrlar ---


@lines_router.patch("/{line_id}", response_model=DailyLedgerDetail, dependencies=[Depends(require_edit("moliya"))])
def update_line(line_id: int, payload: DailyLedgerLineUpdate, db: Session = Depends(get_db)):
    line = db.get(DailyLedgerLine, line_id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_LINE_NOT_FOUND)
    ledger = load_ledger(db, line.ledger_id)
    guard_open(ledger)
    data = payload.model_dump(exclude_unset=True)
    if "amount" in data and data["amount"] is not None:
        data["amount"] = money(data["amount"])
    apply_line(db, line, data)
    db.commit()
    return detail_payload(db, load_ledger(db, line.ledger_id))


@lines_router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("moliya"))])
def delete_line(line_id: int, db: Session = Depends(get_db)):
    line = db.get(DailyLedgerLine, line_id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MSG_LINE_NOT_FOUND)
    guard_open(load_ledger(db, line.ledger_id))
    db.delete(line)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
