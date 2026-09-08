"""Monitoring ko'rsatkichlarini haydovchi hisoboti bilan solishtirish.

Nega bu kerak: SMN marshrut javobida yoqilg'i qatori yo'q -- faqat hozirgi
ko'rsatkich bor. Reys yopilganda «boshida qancha edi» degan savolga javob
faqat o'sha payt yozib qo'yilgan bo'lsa topiladi. Shuning uchun har 10
daqiqada butun park bo'yicha bitta so'rov qilib, namunalarni o'zimizda
saqlaymiz.

Sliv shu jadvaldan chiqadi: mashina qimirlamay turganda bak keskin
kamaysa, bu yoqilg'i sarfi emas -- uni kimdir olgan.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.models.transport import Transport, TransportCheckIn, TransportFuelSample
from backend.app.services import track_distance
from backend.app.services import smn

# Datchik ko'rsatkichi shu oraliqdan tashqarida bo'lsa, u buzuq.
# 83 mashinadan 19 tasi manfiy qiymat qaytaradi (masalan -17143 litr).
FUEL_MIN_LITERS = Decimal("0")
FUEL_MAX_LITERS = Decimal("2000")

# Turgan joyda shu litrdan ko'p kamaysa -- sliv shubhasi. Datchik o'zi
# ham 2-3 litr "tebranadi" (yoqilg'i chayqaladi, harorat o'zgaradi),
# shuning uchun chegara shovqindan yuqori bo'lishi kerak.
DROP_THRESHOLD_LITERS = Decimal("15")

# Namunani reys chetiga qanchalik uzoqdan qabul qilamiz. Aloqa uzilib
# turadi; 45 daqiqadan uzoq bo'lsa, bu boshqa paytning ko'rsatkichi.
MATCH_WINDOW_MINUTES = 45

# Namunalar necha kun saqlanadi. Yopilgan reys tekshirilib bo'lgach,
# nuqtama-nuqta tarix kerak emas.
RETENTION_DAYS = 180


def plausible(liters) -> Decimal | None:
    """Buzuq datchik ko'rsatkichini o'tkazmaydi."""
    if liters is None:
        return None
    try:
        value = Decimal(str(liters))
    except (InvalidOperation, ValueError):
        return None
    return value if FUEL_MIN_LITERS <= value <= FUEL_MAX_LITERS else None


def _dec(value, places: str = "0.01") -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal(places))
    except (InvalidOperation, ValueError):
        return None


def collect_samples(db: Session, now: datetime | None = None) -> dict:
    """Butun park bo'yicha bitta so'rov -- har bog'langan mashinaga bir qator.

    Monitoring ishlamasa jim qaytadi: bu fon vazifasi, u tufayli hech narsa
    to'xtamasligi kerak.
    """
    if not smn.is_configured():
        return {"saved": 0, "reason": smn.MSG_NOT_CONFIGURED}

    result = smn.vehicles()
    if not result.ok:
        return {"saved": 0, "reason": result.error}

    by_object = {v.get("id"): v for v in (result.data or [])}
    moment = now or datetime.now()
    saved = 0
    for transport in db.scalars(select(Transport).where(Transport.smn_object_id.isnot(None))):
        vehicle = by_object.get(transport.smn_object_id)
        if not vehicle:
            continue
        location = vehicle.get("location") or {}
        status = vehicle.get("status") or {}
        db.add(TransportFuelSample(
            transport_id=transport.id,
            captured_at=moment,
            fuel_liters=plausible((vehicle.get("fuel") or {}).get("tankLiters")),
            lat=_dec(location.get("lat"), "0.0000001"),
            lng=_dec(location.get("lng"), "0.0000001"),
            speed=_dec(vehicle.get("speed"), "0.1"),
            engine_on=bool(status.get("engineOn")),
            moving=bool(status.get("moving")),
            online=bool(status.get("online")),
        ))
        saved += 1
    db.commit()
    return {"saved": saved, "reason": None}


def prune_samples(db: Session, days: int = RETENTION_DAYS, now: datetime | None = None) -> int:
    """Eski namunalarni o'chiradi -- 10 daqiqada bir qator tez to'planadi."""
    cutoff = (now or datetime.now()) - timedelta(days=days)
    result = db.execute(delete(TransportFuelSample).where(TransportFuelSample.captured_at < cutoff))
    db.commit()
    return result.rowcount or 0


def samples_between(db: Session, transport_id: int, start: datetime, end: datetime) -> list[TransportFuelSample]:
    return list(db.scalars(
        select(TransportFuelSample)
        .where(
            TransportFuelSample.transport_id == transport_id,
            TransportFuelSample.captured_at >= start,
            TransportFuelSample.captured_at <= end,
        )
        .order_by(TransportFuelSample.captured_at)
    ))


def fuel_at(db: Session, transport_id: int, moment: datetime,
            window_minutes: int = MATCH_WINDOW_MINUTES) -> Decimal | None:
    """Berilgan paytga eng yaqin ishonchli ko'rsatkich.

    Aniq o'sha daqiqadagi namuna bo'lmasligi mumkin (aloqa uzilgan, mashina
    o'chib turgan). Oynadan tashqarisi olinmaydi -- kechagi raqamni bugungi
    deb ko'rsatgandan ko'ra, «ma'lumot yo'q» degani halolroq.
    """
    window = timedelta(minutes=window_minutes)
    rows = list(db.scalars(
        select(TransportFuelSample)
        .where(
            TransportFuelSample.transport_id == transport_id,
            TransportFuelSample.fuel_liters.isnot(None),
            TransportFuelSample.captured_at >= moment - window,
            TransportFuelSample.captured_at <= moment + window,
        )
    ))
    if not rows:
        return None
    nearest = min(rows, key=lambda r: abs(r.captured_at - moment))
    return nearest.fuel_liters


@dataclass
class FuelDrop:
    at: datetime
    liters: Decimal
    lat: Decimal | None
    lng: Decimal | None


def detect_drops(samples: list[TransportFuelSample],
                 threshold: Decimal = DROP_THRESHOLD_LITERS) -> list[FuelDrop]:
    """Mashina turganda bakning keskin kamayishi.

    Harakatdagi kamayish -- oddiy sarf, uni bu yerda hisoblamaymiz. Faqat
    ikkala namunada ham mashina qimirlamagan bo'lsa hisobga olinadi.
    """
    drops: list[FuelDrop] = []
    previous: TransportFuelSample | None = None
    for row in samples:
        if row.fuel_liters is None:
            continue
        if previous is not None and not previous.moving and not row.moving:
            delta = previous.fuel_liters - row.fuel_liters
            if delta >= threshold:
                drops.append(FuelDrop(at=row.captured_at, liters=delta, lat=row.lat, lng=row.lng))
        previous = row
    return drops


# Eski hisobotni qayta hisoblashning ma'nosi yo'q: monitoring marshrutni
# cheksiz saqlamaydi va yopilgan hafta baribir tekshirilib bo'lgan.
CHECKIN_MAX_AGE_DAYS = 7
# Bir yurishda nechta hisobot hisoblanadi. Har biri alohida so'rov, ya'ni
# to'planib qolgan navbat SMNni bo'g'ib qo'ymasligi kerak.
CHECKIN_BATCH_LIMIT = 15


def fill_checkin_distances(db: Session, now: datetime | None = None) -> dict:
    """Ikki hisobot orasida monitoring o'lchagan masofa.

    Spidometrni to'g'ridan-to'g'ri solishtirib bo'lmaydi: SMN jonli
    ro'yxatidagi `odometer` umumiy probeg emas, sessiya hisoblagichi
    (turgan mashinada 0, yurayotganida 76). Solishtirsa bo'ladigan yagona
    narsa -- farq: haydovchi «oldingi hisobotdan beri shuncha yurdim»
    deydi, monitoring esa aslida qancha yurganini biladi.
    """
    if not smn.is_configured():
        return {"filled": 0, "reason": smn.MSG_NOT_CONFIGURED}

    moment = now or datetime.now()
    cutoff = moment - timedelta(days=CHECKIN_MAX_AGE_DAYS)
    pending = list(db.scalars(
        select(TransportCheckIn)
        .where(
            TransportCheckIn.sensor_distance_checked_at.is_(None),
            TransportCheckIn.odometer_km.isnot(None),
            TransportCheckIn.created_at >= cutoff,
        )
        .order_by(TransportCheckIn.created_at)
        .limit(CHECKIN_BATCH_LIMIT)
    ))

    filled = 0
    for checkin in pending:
        # Urinib ko'rilgani belgilanadi: ma'lumot topilmasa ham har 15
        # daqiqada bir xil so'rovni qayta yuborishning ma'nosi yo'q.
        checkin.sensor_distance_checked_at = moment
        transport = db.get(Transport, checkin.transport_id)
        if not transport or not transport.smn_object_id:
            continue
        previous = db.scalars(
            select(TransportCheckIn)
            .where(
                TransportCheckIn.transport_id == checkin.transport_id,
                TransportCheckIn.odometer_km.isnot(None),
                TransportCheckIn.created_at < checkin.created_at,
            )
            .order_by(TransportCheckIn.created_at.desc())
            .limit(1)
        ).first()
        if previous is None:
            continue
        result = smn.track(transport.smn_object_id, previous.created_at.date(), checkin.created_at.date())
        if not result.ok:
            # Xatoda belgini olib tashlaymiz -- monitoring tiklangach
            # qaytadan urinib ko'rilsin.
            checkin.sensor_distance_checked_at = None
            continue
        distance = track_distance.distance_for_window(result.data, previous.created_at, checkin.created_at)
        if distance is None:
            continue
        checkin.sensor_distance_km = distance
        filled += 1

    db.commit()
    return {"filled": filled, "reason": None}
