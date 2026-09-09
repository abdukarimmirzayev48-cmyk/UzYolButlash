"""Reyslarga miqdor yozadi.

Partiya bir nechta reysga bo'linadigan bo'lgach, har bir reysning o'z
miqdori kerak. Migratsiya eski reyslarni to'ldirgan, lekin oradagi
qisqa vaqtda ochilgan partiyalarning reysi miqdorsiz qolgan -- ular
kartochkada «butun miqdor reysga biriktirilmagan» deb turadi.

Yagona reysli partiyada reys butun partiyani tashiydi, shuning uchun
miqdor partiya miqdoriga tenglashtiriladi.

Ishlatish:  .venv/bin/python scripts/backfill_trip_quantities.py [--apply]
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery import DeliveryBatch  # noqa: E402


def main() -> int:
    apply = "--apply" in sys.argv
    changed = 0
    with SessionLocal() as db:
        for batch in db.scalars(select(DeliveryBatch).order_by(DeliveryBatch.batch_number)):
            missing = [trip for trip in batch.trips if trip.planned_quantity is None]
            if not missing:
                continue
            total = sum((Decimal(item.planned_quantity or 0) for item in batch.items), Decimal("0"))
            if len(batch.trips) > 1:
                print(f"  {batch.batch_number:<34} {len(batch.trips)} ta reys -- qo'lda taqsimlash kerak")
                continue
            print(f"  {batch.batch_number:<34} {missing[0].logistics_number} -> {total}")
            changed += 1
            if apply:
                missing[0].planned_quantity = total
        if apply:
            db.commit()

    print(f"\nmiqdor yoziladi: {changed} ta reys")
    if not apply:
        print("(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
