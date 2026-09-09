"""Sisterna sig'imini kiritadi.

Sig'imsiz «bu yuk shu mashinaga sig'adimi» degan tekshiruv ishlamaydi, va
partiya mashinaga sig'maydigan bo'lib rejalashtirilib ketaveradi. Ishlab
chiqarishda o'nta mashinaning hech birida sig'im kiritilmagan, ammo
o'ntasi ham bir xil model -- ya'ni bitta raqam o'ntasiga ham yetadi.

Ishlatish:
    # faqat ko'rish
    .venv/bin/python scripts/set_transport_capacity.py
    # barcha mashinaga bir xil sig'im
    .venv/bin/python scripts/set_transport_capacity.py --tons 22 --apply
    # faqat bittasiga
    .venv/bin/python scripts/set_transport_capacity.py --tons 22 --plate "01 245 ENA" --apply
    # sig'imi bor mashinalarga ham qayta yozish
    .venv/bin/python scripts/set_transport_capacity.py --tons 22 --overwrite --apply
"""

import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.transport import Transport  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tons", type=Decimal, help="sisterna sig'imi, tonna")
    parser.add_argument("--plate", help="faqat shu davlat raqamiga")
    parser.add_argument("--overwrite", action="store_true", help="sig'imi bor mashinalarga ham yozish")
    parser.add_argument("--apply", action="store_true", help="yozish (aks holda faqat ko'rsatadi)")
    args = parser.parse_args()

    with SessionLocal() as db:
        transports = list(db.scalars(select(Transport).order_by(Transport.vehicle_number)))
        header = "sig'im"
        print(f"{'raqam':<14} {'model':<34} {header:>10}")
        changed = 0
        for transport in transports:
            if args.plate and transport.vehicle_number != args.plate:
                continue
            current = transport.capacity_tons
            target = current
            if args.tons is not None and (current is None or args.overwrite):
                target = args.tons
            mark = "" if target == current else "  <- yoziladi"
            print(f"{transport.vehicle_number:<14} {str(transport.brand_model or ''):<34} "
                  f"{str(target if target is not None else '—'):>10}{mark}")
            if target != current:
                changed += 1
                if args.apply:
                    transport.capacity_tons = target
        if args.apply:
            db.commit()

    if args.tons is None:
        print("\n(--tons berilmadi -- faqat hozirgi holat ko'rsatildi)")
    elif not args.apply:
        print(f"\no'zgaradi: {changed} ta (sinov rejimi -- yozish uchun --apply qo'shing)")
    else:
        print(f"\n{changed} ta mashinaga sig'im yozildi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
