"""Ishlatilmagan bo'sh xarid yozuvlarini yopadi.

Xarid ilgari har buyurtmaga avtomatik ochilardi va ko'pi bo'sh qoralama bo'lib
qolardi: mol birja ticketidan kelgan, xarid jarayoni esa hech qachon
boshlanmagan. Bunday yozuv ro'yxatni to'ldiradi va «tasdiq kutilmoqda» degan
sanoqni buzadi.

Faqat butunlay bo'sh (hisob-fakturasiz, taklifsiz, hujjatsiz) va buyurtmasi
allaqachon yetkazilgan yozuvlar yopiladi. Hisobi borlari tegilmaydi -- ular
buyurtma tannarxini ushlab turadi. Idempotent.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal
from backend.app.models.order import Order, OrderStatus
from backend.app.models.procurement import Procurement, ProcurementNote, ProcurementStatus, SupplierOffer
from backend.app.models.supplier_finance import SupplierInvoice

NOTE = "Xarid jarayoni ishlatilmagan: mol boshqa yo'l bilan yetkazilgan."
DELIVERED = (OrderStatus.delivered, OrderStatus.partially_delivered, OrderStatus.closed)
OPEN_STATUSES = (ProcurementStatus.draft, ProcurementStatus.supplier_search, ProcurementStatus.offers_received)


def main() -> int:
    db = SessionLocal()
    closed = 0
    try:
        for p in db.query(Procurement).filter(Procurement.status.in_(OPEN_STATUSES)).all():
            invoices = db.query(SupplierInvoice).filter(SupplierInvoice.procurement_id == p.id).count()
            offers = db.query(SupplierOffer).filter(SupplierOffer.procurement_id == p.id).count()
            if invoices or offers or p.documents:
                print(f"  {p.procurement_number}: ishlatilgan (hisob={invoices}, taklif={offers}), tegilmadi")
                continue
            order = db.get(Order, p.order_id) if p.order_id else None
            if not order or order.status not in DELIVERED:
                state = order.status.value if order else "buyurtmasiz"
                print(f"  {p.procurement_number}: buyurtma hali yopilmagan ({state}), tegilmadi")
                continue
            p.status = ProcurementStatus.cancelled
            db.add(ProcurementNote(procurement_id=p.id, note=NOTE, created_by="system"))
            closed += 1
            print(f"  {p.procurement_number}: yopildi")
        db.commit()
    finally:
        db.close()
    print(f"Yopilgan xaridlar: {closed}")
    return closed


if __name__ == "__main__":
    main()
