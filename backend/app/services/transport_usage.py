"""Bitta mashina bo'yicha xulosa: nechta reys, qancha tonna, qancha kilometr.

Bu savolga ilgari javob berib bo'lmasdi. Reys mashinaga bog'lanmagan edi,
davlat raqami esa matn bo'lib yozilardi -- bazada bitta raqam uchta yozuvda
takrorlangan, ya'ni «80 K 118 KA bo'yicha sakkizta reys» degan raqamni
qaysi yozuvga yozishni tizim bila olmasdi.

Endi reysda mashina identifikatori bor va xulosa shundan chiqadi. Hisob
faqat bog'langan reyslardan yig'iladi: bog'lanmagan reys jimgina qo'shilib
ketsa, xulosa haqiqatdan katta bo'lib chiqadi va buni hech kim sezmaydi.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

MSG_UNLINKED_TRIPS = "Mashina biriktirilmagan reyslar bor"


@dataclass
class TransportUsage:
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    loaded_km: Decimal = Decimal("0")
    empty_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    # Normadan chetlanish faqat norma kiritilgan mashinada hisoblanadi.
    norm_liters: Decimal | None = None
    fuel_difference_liters: Decimal | None = None
    liters_per_100km: Decimal | None = None
    last_trip_date: date | None = None
    warnings: list[str] = field(default_factory=list)


def _dec(value) -> Decimal:
    return Decimal(value or 0)


def build_usage(*, trips: list[dict], norm_loaded: Decimal | None, norm_empty: Decimal | None) -> TransportUsage:
    """`trips`: [{date, tons, distance_km, loaded_km, empty_km, fuel_liters}]"""
    usage = TransportUsage()
    for trip in trips:
        usage.trip_count += 1
        usage.delivered_tons += _dec(trip.get("tons"))
        usage.distance_km += _dec(trip.get("distance_km"))
        usage.loaded_km += _dec(trip.get("loaded_km"))
        usage.empty_km += _dec(trip.get("empty_km"))
        usage.fuel_liters += _dec(trip.get("fuel_liters"))
        when = trip.get("date")
        if when and (usage.last_trip_date is None or when > usage.last_trip_date):
            usage.last_trip_date = when

    if usage.distance_km > 0 and usage.fuel_liters > 0:
        usage.liters_per_100km = (usage.fuel_liters / usage.distance_km * Decimal("100")).quantize(Decimal("0.01"))

    # Norma bo'yicha sarf: yuklangan va bo'sh masofa alohida hisoblanadi.
    # Ular kiritilmagan bo'lsa, umumiy masofani ikkiga bo'lish mumkin edi --
    # lekin bu taxmin bo'lardi va u ustidan chiqadigan «ortiqcha sarf»
    # raqamiga ishonib bo'lmaydi.
    if norm_loaded and norm_empty and (usage.loaded_km > 0 or usage.empty_km > 0):
        usage.norm_liters = (
            (usage.loaded_km * Decimal(norm_loaded) + usage.empty_km * Decimal(norm_empty)) / Decimal("100")
        ).quantize(Decimal("0.01"))
        if usage.fuel_liters > 0:
            usage.fuel_difference_liters = (usage.fuel_liters - usage.norm_liters).quantize(Decimal("0.01"))
    return usage
