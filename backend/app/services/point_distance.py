"""Ikki nuqta orasidagi masofa.

Reja masofasi ilgari qo'lda yozilardi va ko'pincha bo'sh qolardi. U esa
bekorga turmaydi: yoqilg'i hisobida «rejadan ortiq yurilgan» aynan shu
raqamga solishtiriladi. Nuqtalarning koordinatasi ma'lumotnomada bor, ya'ni
masofani o'zimiz o'lchay olamiz.

Bir narsani ochiq aytish kerak: koordinatalar orasidagi masofa -- to'g'ri
chiziq, mashina esa yo'ldan yuradi. Shuning uchun natijaga yo'l koeffitsienti
qo'llanadi. Bu aniq raqam emas, taxmin: tog'li yo'nalishda haqiqiy masofa
undan ham ko'p bo'ladi. Shu sababdan raqam formaga taklif sifatida qo'yiladi
va operator uni tuzatishi mumkin.
"""

from decimal import Decimal, ROUND_HALF_UP
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088

# To'g'ri chiziqni yo'l masofasiga yaqinlashtiruvchi koeffitsient. O'zbekiston
# yo'l tarmog'i uchun odatiy qiymat; tijorat qarori, shu yerdan o'zgartiriladi.
ROAD_FACTOR = Decimal("1.25")

MSG_NO_COORDINATES = "Nuqtaning koordinatasi ko'rsatilmagan"


def _coord(value) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def straight_line_km(lat1, lon1, lat2, lon2) -> Decimal | None:
    """Ikki koordinata orasidagi to'g'ri chiziq (havo yo'li)."""
    points = [_coord(lat1), _coord(lon1), _coord(lat2), _coord(lon2)]
    if any(value is None for value in points):
        return None
    a_lat, a_lon, b_lat, b_lon = (radians(value) for value in points)
    d_lat = b_lat - a_lat
    d_lon = b_lon - a_lon
    h = sin(d_lat / 2) ** 2 + cos(a_lat) * cos(b_lat) * sin(d_lon / 2) ** 2
    km = 2 * EARTH_RADIUS_KM * asin(sqrt(h))
    return Decimal(str(km)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def road_km(straight: Decimal | None) -> Decimal | None:
    """To'g'ri chiziqdan yo'l masofasining taxmini."""
    if straight is None:
        return None
    return (straight * ROAD_FACTOR).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def between_points(origin, destination) -> dict:
    """Ikkita `DeliveryPoint` orasidagi masofa va uning sababi."""
    if not origin or not destination:
        return {"straight_km": None, "road_km": None, "reason": MSG_NO_COORDINATES}
    straight = straight_line_km(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
    if straight is None:
        return {"straight_km": None, "road_km": None, "reason": MSG_NO_COORDINATES}
    return {"straight_km": straight, "road_km": road_km(straight), "reason": None}
