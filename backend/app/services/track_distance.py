"""Marshrut nuqtalari bo'yicha bosib o'tilgan masofa.

SMN javobidagi tayyor `distanceKm` butun kunga tegishli. Reys kunning bir
qismi bo'lsa yoki mashina o'sha kuni yana boshqa ish qilgan bo'lsa, o'sha
raqam reysning masofasi emas -- kunning masofasi. Shuning uchun aniq vaqt
oralig'i ma'lum bo'lganda nuqtalarni qisqartirib, masofani o'zimiz yig'amiz.

Nuqtalar bir necha soniyada bir keladi, ya'ni ular orasidagi to'g'ri
chiziqlar yig'indisi haqiqiy yo'lga juda yaqin.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from backend.app.services.point_distance import straight_line_km


def parse_point_time(value) -> datetime | None:
    """SMN nuqtasining vaqtini mahalliy (naive) vaqtga aylantiradi.

    Monitoring UTC beradi ("...Z"), bazadagi sanalar esa mahalliy va
    tzsiz. Ikkalasini solishtirish uchun bittasiga keltirish shart, aks
    holda oyna 5 soatga surilib ketadi.
    """
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        return moment
    return moment.astimezone().replace(tzinfo=None)


def sum_distance(points, start: datetime | None = None, end: datetime | None = None) -> tuple[Decimal, int]:
    """Oynaga tushgan nuqtalar bo'yicha masofa va nuqtalar soni."""
    total = Decimal("0")
    previous = None
    used = 0
    for point in points or []:
        moment = parse_point_time(point.get("time"))
        if moment is not None:
            if start is not None and moment < start:
                continue
            if end is not None and moment > end:
                continue
        lat, lng = point.get("lat"), point.get("lng")
        if lat is None or lng is None:
            continue
        used += 1
        if previous is not None:
            leg = straight_line_km(previous[0], previous[1], lat, lng)
            if leg is not None:
                total += leg
        previous = (lat, lng)
    return total.quantize(Decimal("0.01")), used


def distance_for_window(track: dict | None, start: datetime | None, end: datetime | None) -> Decimal | None:
    """Reys oynasidagi masofa; oyna berilmasa SMNning kunlik raqami.

    Oynaga bittayam nuqta tushmasa -- javob yo'q. Nol qaytarish «mashina
    qimirlamadi» degan ma'noni beradi va bu yolg'on bo'lishi mumkin.
    """
    if not track:
        return None
    if start is None and end is None:
        value = track.get("distanceKm")
        return Decimal(str(value)) if value is not None else None
    total, used = sum_distance(track.get("points"), start, end)
    if used < 2:
        return None
    return total
