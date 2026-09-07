"""Zaxiradagi mol uchun qabul yozuvini tiklaydi.

Bir muddat ticket ochilishi bilan butun miqdor zaxiraga tushardi va qabul
yozuvi umuman yaratilmasdi. Endi zaxira qabullardan hisoblanadi, ya'ni
o'sha partiyalarda «zaxirada bor, lekin qachon olingani noma'lum» degan
nomuvofiqlik qoladi.

Skript farqni tenglashtiradi: partiyaga kirim qilingan miqdordan qabullar
yig'indisi kam bo'lsa, farq uchun bitta qabul yozuvi ochiladi. Sana --
ticket sanasi, chunki aniqrog'i ma'lum emas va o'ylab topish noto'g'ri
bo'lardi. Idempotent: ikkinchi marta ishga tushirilsa farq qolmaydi.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal
from backend.app.models.inventory import ExchangeTicket, ExchangeTicketIntake

NOTE = "Avtomatik tiklandi: zaxiradagi mol uchun qabul yozuvi yo'q edi."


def main() -> int:
    db = SessionLocal()
    created = 0
    try:
        for ticket in db.query(ExchangeTicket).all():
            lot = ticket.stock_lot
            if not lot:
                continue
            taken = sum((row.quantity for row in ticket.intakes), Decimal("0"))
            gap = Decimal(lot.quantity_initial or 0) - taken
            if gap <= 0:
                continue
            db.add(ExchangeTicketIntake(
                ticket_id=ticket.id,
                intake_date=ticket.ticket_date,
                quantity=gap,
                document_number=None,
                notes=NOTE,
                created_by="system",
            ))
            created += 1
            print(f"  {ticket.ticket_number}: {gap} qo'shildi (partiyada {lot.quantity_initial}, qabullarda {taken})")
        db.commit()
    finally:
        db.close()
    print(f"Tiklangan qabullar: {created}")
    return created


if __name__ == "__main__":
    main()
