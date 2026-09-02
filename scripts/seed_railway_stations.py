"""Temiryo'l stansiyalari -- kartochkalar.

Ro'yxat `services/railway_stations.py` ma'lumotnomasidan olinadi:
railway.uz stansiya/kod ro'yxati va OpenStreetMap kesimi asosidagi 220 ta
yuk stansiyasi, har biri ESR kodi va koordinatasi bilan.

Manzil ustunida stansiyaga eng yaqin aholi punkti va undan bo'lgan
masofa turadi («Qırqqız (qishloq), 24.3 km»). Bu rasmiy pochta manzili
emas va shundayligicha yoziladi: masofa ko'rinib turgani uchun uni
manzil deb o'qib bo'lmaydi, ya'ni chalg'itmaydi.

Viloyat bo'sh qoldirilgan: stansiya qaysi viloyatga tegishli ekani
manbada yo'q, koordinatadan taxmin qilish esa xato beradi.

Mas'ul shaxs so'ralmaydi: vagon stansiyaga keladi, uni temir yo'l qabul
qiladi -- mas'ul shaxs mijoz korxonasida, stansiyada emas.

Mavjud yozuv ustidan yozilmaydi: nomi, izohi va koordinatasi qo'lda
to'g'rilangan bo'lishi mumkin. Faqat bo'sh koordinata to'ldiriladi.

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
from backend.app.services import railway_stations  # noqa: E402

# kod, nomi, nakladnoylardagi vagon soni va tonna -- izohda qoladi
# Haqiqatan ishlatilgan stansiyalar -- izohda vagon soni va tonna qoladi.
USED_STATIONS = [
    ("721802", "Барраж", 48, 3348),
    ("722504", "Хамза", 11, 766),
    ("721200", "Кадырья", 5, 350),
    ("723206", "Тойтепа", 3, 210),
    ("723009", "Ахангаран", 1, 70),
]

NOTE = "Texnik tuz qabul stansiyasi. 2025-10 -- 2026-02 da {wagons} vagon, {tons} t qabul qilingan."


def main() -> int:
    db = SessionLocal()
    by_code = {point.station_code: point for point in db.query(DeliveryPoint).all() if point.station_code}
    used = {code: (wagons, tons) for code, _, wagons, tons in USED_STATIONS}

    added = 0
    located = 0
    addressed = 0
    for code, (cyr, latin, lat, lon, near) in railway_stations.STATIONS.items():
        point = by_code.get(code)
        if point:
            if not (point.latitude and point.longitude):
                point.latitude, point.longitude = lat, lon
                located += 1
            if not point.address and near:
                point.address = near
                addressed += 1
            continue
        note = None
        if code in used:
            wagons, tons = used[code]
            note = NOTE.format(wagons=wagons, tons=tons)
        db.add(
            DeliveryPoint(
                name=f"{cyr} stansiyasi",
                code=code,
                station_code=code,
                point_type=DeliveryPointType.railway_station,
                status=DeliveryPointStatus.active,
                address=near or None,
                latitude=lat,
                longitude=lon,
                notes=note,
            )
        )
        added += 1
    db.commit()

    print(f"Qo'shildi: {added} ta")
    if located:
        print(f"Koordinata to'ldirildi: {located} ta")
    if addressed:
        print(f"Manzil to'ldirildi: {addressed} ta")
    stations = db.query(DeliveryPoint).filter(DeliveryPoint.point_type == DeliveryPointType.railway_station).all()
    print(f"Jami stansiya: {len(stations)}")
    print("Koordinatasi yo'q:", sum(1 for s in stations if not (s.latitude and s.longitude)))
    print("Manzili yo'q:", sum(1 for s in stations if not s.address))
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
