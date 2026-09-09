"""Yetkazib berish modelini manbadan qayta hisoblaydi.

Model endi so'ralmaydi -- u manbadan kelib chiqadi va serverda
hisoblanadi. Mavjud yozuvlar esa eski, qo'lda tanlangan qiymat bilan
qolgan, ya'ni ular yangi qoidaga zid turadi.

Skript buyurtmalarning modelini manbadan tiklaydi va partiyalarga
ko'chiradi. Alohida e'tibor: import buyurtmasining partiyasiga transport
biriktirilgan bo'lsa, bu qarama-qarshilik -- import molni biz
tashimaymiz. Bunday partiya faqat ro'yxatga chiqariladi, avtomatik
o'zgartirilmaydi: transportni olib tashlash yoki manbani to'g'rilash --
odamning qarori.

Ishlatish:  .venv/bin/python scripts/sync_fulfillment_from_source.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.api.orders import default_fulfillment_for  # noqa: E402
from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery import DeliveryBatch  # noqa: E402
from backend.app.models.order import FulfillmentType, Order  # noqa: E402


def main() -> int:
    apply = "--apply" in sys.argv
    changed_orders = 0
    changed_batches = 0
    conflicts = []

    with SessionLocal() as db:
        for order in db.scalars(select(Order).order_by(Order.order_number)):
            wanted = default_fulfillment_for(order.source_type)
            if order.fulfillment_type != wanted:
                print(f"  buyurtma {order.order_number:<22} {order.source_type.value:<18} "
                      f"{order.fulfillment_type.value} -> {wanted.value}")
                changed_orders += 1
                if apply:
                    order.fulfillment_type = wanted

        for batch in db.scalars(select(DeliveryBatch).order_by(DeliveryBatch.batch_number)):
            order = db.get(Order, batch.order_id)
            if not order:
                continue
            wanted = default_fulfillment_for(order.source_type).value
            if batch.fulfillment_type == wanted:
                continue
            has_transport = bool(batch.logistics and batch.logistics.transport_id)
            if wanted != FulfillmentType.company_managed_delivery.value and has_transport:
                conflicts.append((batch.batch_number, order.order_number, batch.logistics.vehicle_number))
                continue
            print(f"  partiya  {batch.batch_number:<22} {batch.fulfillment_type} -> {wanted}")
            changed_batches += 1
            if apply:
                batch.fulfillment_type = wanted

        if apply:
            db.commit()

    print(f"\nbuyurtma: {changed_orders}, partiya: {changed_batches}")
    if conflicts:
        print(f"\nQARAMA-QARSHILIK ({len(conflicts)} ta) -- import partiyasiga transport biriktirilgan:")
        for batch_number, order_number, vehicle in conflicts:
            print(f"  {batch_number:<22} buyurtma {order_number:<22} transport {vehicle}")
        print("  Yechim: yo transportni olib tashlang, yo buyurtmaning manbasini mahalliyga o'zgartiring.")
    if not apply:
        print("\n(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
