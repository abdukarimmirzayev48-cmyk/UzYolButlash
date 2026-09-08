"""Transportlarni davlat raqami bo'yicha SMN monitoring obyektiga bog'laydi.

Faqat aniq moslikni yozadi: bitta normallashtirilgan raqamga bittadan ortiq
monitoring obyekti to'g'ri kelsa, uni qo'lda hal qilish kerak -- avtomatik
tanlash noto'g'ri mashinani kuzatishga olib keladi.

Ishlatish:  .venv/bin/python scripts/link_smn_transports.py [--apply]
--apply bo'lmasa faqat ko'rsatadi, yozmaydi.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.transport import Transport  # noqa: E402
from backend.app.services import smn  # noqa: E402


def norm(plate: str | None) -> str:
    return re.sub(r"[^0-9A-Z]", "", (plate or "").upper())


def main() -> int:
    apply = "--apply" in sys.argv

    result = smn.vehicles()
    if not result.ok:
        print("SMN xatosi:", result.error)
        return 1

    by_plate: dict[str, list[dict]] = {}
    for v in result.data:
        by_plate.setdefault(norm(v.get("plate") or v.get("name")), []).append(v)
    print(f"monitoringda {len(result.data)} ta mashina\n")

    linked = manual = already = 0
    with SessionLocal() as db:
        for t in db.scalars(select(Transport).order_by(Transport.vehicle_number)):
            hits = by_plate.get(norm(t.vehicle_number), [])
            if t.smn_object_id is not None:
                print(f"  {t.vehicle_number:<14} allaqachon bog'langan (obyekt {t.smn_object_id})")
                already += 1
            elif len(hits) == 1:
                print(f"  {t.vehicle_number:<14} -> obyekt {hits[0]['id']}")
                if apply:
                    t.smn_object_id = hits[0]["id"]
                linked += 1
            else:
                print(f"  {t.vehicle_number:<14} -- {len(hits)} ta moslik, qo'lda")
                manual += 1
        if apply:
            db.commit()

    print(f"\nbog'landi: {linked}, qo'lda kerak: {manual}, avvaldan: {already}")
    if not apply:
        print("(sinov rejimi -- yozish uchun --apply qo'shing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
