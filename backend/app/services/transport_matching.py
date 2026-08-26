"""Reysdagi davlat raqamini parkdagi mashinaga bog'lash.

Reyslar mashinaga bog'lanmagan edi -- davlat raqami shunchaki matn bo'lib
yozilardi. Bu bitta savolni ham javobsiz qoldirardi: shu bitumovoz shu oyda
nechta reys qildi, qancha tonna tashidi, qancha yoqilg'i yedi.

Bog'lashni bir marta, mavjud yozuvlar ustidan o'tkazish kerak, lekin raqam
bo'yicha oddiy solishtirish yetmaydi: bazada bitta raqam uchta yozuvda
takrorlangan. Shuning uchun ishonch darajasi bo'yicha bosqichma-bosqich
qidiriladi va oxirgi bosqichda ham noaniqlik qolsa, bog'lanmaydi.

Taxmin qilib bog'lash -- eng yomon yechim: keyin «bu mashinaning reysi»
degan ro'yxatda begona reys turadi va uni hech kim tekshirmaydi.
"""

from dataclasses import dataclass, field


def norm(value: str | None) -> str:
    return (value or "").strip().casefold()


@dataclass
class MatchReport:
    linked: dict[int, int] = field(default_factory=dict)
    by_reason: dict[str, int] = field(default_factory=dict)
    unresolved: list[dict] = field(default_factory=list)

    def count(self, reason: str) -> None:
        self.by_reason[reason] = self.by_reason.get(reason, 0) + 1


def match_logistics(logistics_rows: list[dict], transports: list[dict]) -> MatchReport:
    """`logistics_rows`: [{id, vehicle_number, trailer_number, driver_name}]
    `transports`: [{id, vehicle_number, trailer_number, driver_name}]"""
    report = MatchReport()
    by_plate: dict[str, list[dict]] = {}
    for transport in transports:
        by_plate.setdefault(norm(transport.get("vehicle_number")), []).append(transport)

    by_id = {transport["id"]: transport for transport in transports}

    for row in logistics_rows:
        plate = norm(row.get("vehicle_number"))
        if not plate:
            report.count("raqam yozilmagan")
            continue
        # `carrier_id` maydoni tashuvchi uchun o'ylangan edi, lekin amalda
        # unga transport identifikatori yozilib kelgan -- interfeys mashina
        # tanlanganda uni shu yerga qo'yardi. Bu eng ishonchli belgi, faqat
        # tekshirib ishlatiladi: ko'rsatilgan mashinaning raqami reysdagi
        # raqam bilan bir xil bo'lishi shart.
        carrier = by_id.get(row.get("carrier_id"))
        if carrier and norm(carrier.get("vehicle_number")) == plate:
            report.linked[row["id"]] = carrier["id"]
            report.count("mashina ko'rsatilgan")
            continue
        candidates = by_plate.get(plate, [])
        if not candidates:
            report.count("parkda yo'q")
            report.unresolved.append({"logistics": row, "reason": "parkda yo'q", "candidates": []})
            continue
        if len(candidates) == 1:
            report.linked[row["id"]] = candidates[0]["id"]
            report.count("raqam bo'yicha")
            continue
        # Bir nechta nomzod: haydovchi ismi ko'proq narsani aytadi, chunki
        # takroriy yozuvlar aynan haydovchi bilan farq qiladi.
        named = [t for t in candidates if norm(t.get("driver_name")) and norm(t.get("driver_name")) == norm(row.get("driver_name"))]
        if len(named) == 1:
            report.linked[row["id"]] = named[0]["id"]
            report.count("haydovchi bo'yicha")
            continue
        trailered = [t for t in candidates if norm(t.get("trailer_number")) and norm(t.get("trailer_number")) == norm(row.get("trailer_number"))]
        if len(trailered) == 1:
            report.linked[row["id"]] = trailered[0]["id"]
            report.count("tirkama bo'yicha")
            continue
        report.count("aniqlanmadi")
        report.unresolved.append({"logistics": row, "reason": "bir nechta nomzod", "candidates": candidates})
    return report
