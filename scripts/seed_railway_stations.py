"""Texnik tuz keladigan temiryo'l stansiyalari.

Ro'yxat «Техник туз маълумот 19.08.2026» faylidan olingan: 68 ta vagon
nakladnoysida uchragan qabul stansiyalari. Kod va nom nakladnoydagi
yozilishicha («721802 - Барраж»).

Koordinata ataylab bo'sh qoldirilgan. Taxminiy koordinata yozilsa,
haydovchi noto'g'ri joyga boradi -- panel esa «koordinatasi kiritilmagan
nuqta bor» deb ogohlantirib turadi va uni xaritadan belgilash mumkin.

Viloyat ham bo'sh: stansiya qaysi tumanga tegishli ekani faylda yo'q,
taxmin qilish esa manzilni buzadi.

Takroran ishga tushirilsa xavfsiz: kodi bor stansiya qayta qo'shilmaydi.

    .venv/bin/python scripts/seed_railway_stations.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.delivery_point import (  # noqa: E402
    DeliveryPoint,
    DeliveryPointStatus,
    DeliveryPointType,
)

# kod, nomi, nakladnoylardagi vagon soni va tonna -- izohda qoladi
STATIONS = [
    ("721802", "Барраж", 48, 3348),
    ("722504", "Хамза", 11, 766),
    ("721200", "Кадырья", 5, 350),
    ("723206", "Тойтепа", 3, 210),
    ("723009", "Ахангаран", 1, 70),
]

NOTE = "Texnik tuz qabul stansiyasi. 2025-10 -- 2026-02 da {wagons} vagon, {tons} t qabul qilingan."


def main() -> int:
    db = SessionLocal()
    existing = {point.station_code for point in db.query(DeliveryPoint).all() if point.station_code}

    added = 0
    for code, name, wagons, tons in STATIONS:
        if code in existing:
            print(f"  {code} {name}: allaqachon bor")
            continue
        db.add(
            DeliveryPoint(
                name=f"{name} stansiyasi",
                code=code,
                station_code=code,
                point_type=DeliveryPointType.railway_station,
                status=DeliveryPointStatus.active,
                notes=NOTE.format(wagons=wagons, tons=tons),
            )
        )
        added += 1
        print(f"  {code} {name}: qo'shildi")
    db.commit()

    print(f"\nQo'shildi: {added} ta")
    stations = db.query(DeliveryPoint).filter(DeliveryPoint.point_type == DeliveryPointType.railway_station).all()
    print(f"Jami stansiya: {len(stations)}")
    print("Koordinatasi yo'q:", sum(1 for s in stations if not (s.latitude and s.longitude)))
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
