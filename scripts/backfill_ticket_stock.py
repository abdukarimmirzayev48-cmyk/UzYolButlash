"""Ochiq ticketlar zaxirasini ticket miqdoriga tenglashtiradi.

Ilgari mol ticketga alohida «qabul» yozilganda zaxiraga tushardi. Endi ticket
ochilishi bilan butun miqdor zaxirada bo'ladi, shuning uchun eski ticketlarning
partiyalari to'ldirilishi kerak. Idempotent: farq bo'lmasa hech narsa qilmaydi.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal
from backend.app.models.inventory import (
    ExchangeTicket,
    ExchangeTicketStatus,
    StockLot,
    StockMovement,
    StockMovementType,
)

ACTIVE = [
    ExchangeTicketStatus.opened,
    ExchangeTicketStatus.partially_paid,
    ExchangeTicketStatus.overdue,
    ExchangeTicketStatus.paid,
]


def main() -> int:
    db = SessionLocal()
    changed = 0
    try:
        for ticket in db.query(ExchangeTicket).filter(ExchangeTicket.status.in_(ACTIVE)).all():
            lot = ticket.stock_lot
            if not lot:
                print(f"  {ticket.ticket_number}: partiya yo'q, o'tkazib yuborildi")
                continue
            delta = Decimal(ticket.quantity) - Decimal(lot.quantity_initial)
            if delta <= 0:
                continue
            lot.quantity_initial = Decimal(ticket.quantity)
            lot.quantity_available = Decimal(lot.quantity_available) + delta
            db.add(
                StockMovement(
                    stock_lot_id=lot.id,
                    movement_type=StockMovementType.purchase_in,
                    quantity=delta,
                    to_location_id=lot.stock_location_id,
                    notes=f"Ticket to'liq zaxiraga o'tkazildi: {ticket.ticket_number}",
                    created_by="system",
                )
            )
            changed += 1
            print(f"  {ticket.ticket_number}: +{delta} {lot.unit} -> {lot.quantity_initial}")
        db.commit()
    finally:
        db.close()
    print(f"To'ldirilgan partiyalar: {changed}")
    return changed


if __name__ == "__main__":
    main()
