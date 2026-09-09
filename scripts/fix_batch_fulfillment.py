"""Transporti biriktirilgan partiyaning modelini haqiqatga moslaydi.

Yetkazib berish modeli ilgari shunchaki yorliq edi va hech narsani
belgilamasdi, shuning uchun «ta'minotchi yetkazadi» deb belgilangan
partiyalarga ham bemalol o'z mashinamiz biriktirilgan.

Endi model qoida: bunday partiyada transport bo'lmaydi. Eski yozuvlar
o'sha holicha qolsa, ular boshi berk ko'chada qoladi -- interfeys
transport bo'limlarini yashiradi, reysni yopish esa odometrni talab
qilaveradi va uni kiritadigan joy qolmaydi.

Shuning uchun yozuvni ishga moslaymiz, teskarisiga emas: mashina
biriktirilgan bo'lsa, demak biz tashiganmiz.

Ishlatish:  .venv/bin/python scripts/fix_batch_fulfillment.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery import DeliveryBatch  # noqa: E402
from backend.app.models.order import FulfillmentType  # noqa: E402

MANAGED = FulfillmentType.company_managed_delivery.value


def main() -> int:
    apply = "--apply" in sys.argv
    with SessionLocal() as db:
        batches = list(db.scalars(select(DeliveryBatch).order_by(DeliveryBatch.batch_number)))
        affected = [
            b for b in batches
            if b.fulfillment_type != MANAGED and b.logistics and b.logistics.transport_id
        ]
        print(f"jami partiya: {len(batches)} | modeli to'g'rilanadi: {len(affected)}\n")
        for b in affected:
            print(f"  {b.batch_number:<22} {b.fulfillment_type:<30} -> {MANAGED}"
                  f"  (transport {b.logistics.vehicle_number})")
            if apply:
                b.fulfillment_type = MANAGED
        if apply:
            db.commit()
            print(f"\n{len(affected)} ta partiya yangilandi.")
        else:
            print("\n(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
