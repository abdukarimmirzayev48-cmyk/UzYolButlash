"""Reys holatini o'z faktlaridan qayta hisoblaydi.

Reysning holati partiya darajasidagi faktdan chiqarilardi: partiya
bandlarida qabul miqdori bo'lsa, tegilgan har qanday reys «Qabul
qilindi» bo'lardi. Bitta reysli partiyada bu to'g'ri edi, chunki
partiyaning qabuli o'sha yagona reysning qabuli.

O'n ikki reysli partiyada esa birinchi mashina qabul qilingach, keyin
transport biriktirilgan mashinalar yuklanmasdan turib «qabul qilindi»
bo'lib qolgan -- ya'ni yo'lga ham chiqmagan reys yopiq ko'rinadi va
dispetcher uni qaytadan yubora olmaydi.

Qoida `sync_logistics_status` da tuzatildi; bu skript o'sha paytda
buzilgan yozuvlarni tozalaydi.

Ishlatish:  .venv/bin/python scripts/fix_trip_statuses.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from backend.app.api.delivery import TRIP_RANK, sync_logistics_status  # noqa: E402
from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery import DeliveryBatch  # noqa: E402


def main() -> int:
    apply = "--apply" in sys.argv
    changed = 0
    with SessionLocal() as db:
        batches = db.scalars(
            select(DeliveryBatch)
            .options(selectinload(DeliveryBatch.trips), selectinload(DeliveryBatch.items))
            .order_by(DeliveryBatch.id)
        )
        for batch in batches:
            for trip in batch.trips:
                before = trip.status
                sync_logistics_status(trip, batch)
                after = trip.status
                # Faqat oldinga surib yuborilgan yozuvlar tuzatiladi.
                # Orqada qolgan reysni oldinga surish -- xuddi o'sha eski
                # xatoni takrorlash: qo'lda qo'yilgan holatni bosib
                # ketardi.
                if before == after or TRIP_RANK.get(after, 0) >= TRIP_RANK.get(before, 0):
                    trip.status = before
                    continue
                changed += 1
                print(f"  {trip.logistics_number:<36} {before.value} -> {after.value}")
                if not apply:
                    trip.status = before
        if apply:
            db.commit()

    print(f"\no'zgaradi: {changed} ta reys")
    if not apply:
        print("(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
