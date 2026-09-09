"""Kartochkadan olingan yuklash/yetkazish manzillarini tozalaydi.

Manzil endi faqat nuqta ma'lumotnomasidan olinadi. Ilgari nuqta
bo'lmasa u mijoz yoki ta'minotchi kartochkasidan to'ldirilardi -- u esa
yuridik manzil, ya'ni haydovchi bormaydigan joy va ko'pincha butunlay
boshqa viloyat.

Skript faqat nuqtasi yo'q reyslarning manzilini bo'shatadi: nuqtadan
kelgan manzilga tegilmaydi. Bo'sh maydon yolg'on manzildan yaxshiroq --
partiyada nuqta tanlangan zahoti manzil o'zi to'ladi.

Ishlatish:  .venv/bin/python scripts/clear_card_addresses.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery import Logistics  # noqa: E402


def blank(value) -> bool:
    return not (value or "").strip()


def main() -> int:
    apply = "--apply" in sys.argv
    cleared_delivery = cleared_loading = 0

    with SessionLocal() as db:
        for logistics in db.scalars(select(Logistics).order_by(Logistics.id)):
            batch = logistics.batch
            if not batch:
                continue
            drop_delivery = not batch.delivery_point_id and not blank(logistics.delivery_address)
            drop_loading = not batch.loading_point_id and not blank(logistics.loading_address)
            if not drop_delivery and not drop_loading:
                continue
            number = batch.batch_number
            if drop_delivery:
                print(f"  {number:<24} yetkazish: {logistics.delivery_address[:60]}")
                cleared_delivery += 1
                if apply:
                    logistics.delivery_address = None
            if drop_loading:
                print(f"  {number:<24} yuklash:   {logistics.loading_address[:60]}")
                cleared_loading += 1
                if apply:
                    logistics.loading_address = None
        if apply:
            db.commit()

    print(f"\nyetkazish manzili tozalanadi: {cleared_delivery}, yuklash: {cleared_loading}")
    if not apply:
        print("(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
