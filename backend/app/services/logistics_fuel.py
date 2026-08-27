"""Reysda yoqilg'i qayerga ketgani.

`fuel_consumption_liters` maydoni ilgari ham bor edi, lekin u qo'lda
yozilardi va hech narsa bilan solishtirilmasdi -- ya'ni unga istalgan raqamni
yozib qo'yish mumkin edi va uni hech kim tekshira olmasdi.

Endi zanjir to'liq:

    bakdagi qoldiq + quyilgani - oxirgi qoldiq  =  haqiqiy sarf
    yuklangan masofa x normasi + bo'sh masofa x normasi  =  norma bo'yicha sarf
    ikkovining farqi  =  chetlanish

Chetlanish har doim bo'ladi: yo'l, yuk og'irligi, havo harorati, haydash
uslubi. Shuning uchun bir oz bag'rikenglik qoldiriladi va faqat undan
oshgani «slivga shubha» deb belgilanadi. Bag'rikenglik chegarasi -- tijorat
qarori, texnik emas; u shu yerda bitta joyda turadi va o'zgartirilishi
kerak bo'lsa, shu yerdan o'zgartiriladi.

Masofa ham tekshiriladi. Odometr reysning ikki uchida olinadi, GPS masofasi
esa qo'lda kiritiladi -- trekerga ulanish yo'q. Ikkovi bir-biriga yaqin
bo'lishi kerak; farq katta bo'lsa, yo odometr aylantirilgan, yo GPS raqami
noto'g'ri ko'chirilgan. Ikkalasi ham bilib qo'yishga arziydi.
"""

from dataclasses import dataclass, field
from decimal import Decimal

# Normadan shuncha foiz oshguncha e'tibor talab qilmaydi. Bu tijorat
# qarori: past qo'yilsa har reys «shubhali» bo'lib chiqadi, baland
# qo'yilsa haqiqiy sliv sezilmay qoladi.
TOLERANCE_PERCENT = Decimal("10")

# Odometr va GPS masofasi shuncha kilometrgacha farq qilishi normal.
GPS_TOLERANCE_KM = Decimal("15")

# Rejadan shuncha kilometr oshsa, ortiqcha yurish deb belgilanadi.
OVERRUN_TOLERANCE_KM = Decimal("20")

MSG_OVER_NORM = "Yoqilg'i normadan ortiq sarflangan"
MSG_SUSPECTED_SIPHONING = "Slivga shubha"
MSG_NORM_MISSING = "Mashinaga yoqilg'i normasi kiritilmagan"
MSG_MILEAGE_SPLIT_MISSING = "Yuklangan va bo'sh masofa kiritilmagan"
MSG_GPS_MISMATCH = "Odometr va GPS masofasi bir-biriga mos emas"
MSG_ODOMETER_BACKWARDS = "Qaytish odometri chiqish odometridan kichik"
MSG_OVERRUN = "Rejadagi masofadan ortiq yurilgan"


@dataclass
class FuelPosition:
    # Bak hisobi
    before_liters: Decimal | None = None
    added_liters: Decimal | None = None
    after_liters: Decimal | None = None
    actual_liters: Decimal | None = None
    # Norma
    norm_liters: Decimal | None = None
    difference_liters: Decimal | None = None
    difference_percent: Decimal | None = None
    tolerance_liters: Decimal | None = None
    suspected_liters: Decimal | None = None
    liters_per_100km: Decimal | None = None
    # Masofa
    odometer_distance_km: Decimal | None = None
    distance_km: Decimal | None = None
    gps_distance_km: Decimal | None = None
    gps_difference_km: Decimal | None = None
    planned_distance_km: Decimal | None = None
    overrun_km: Decimal | None = None
    warnings: list[str] = field(default_factory=list)


def _dec(value) -> Decimal | None:
    return None if value is None or value == "" else Decimal(value)


def build_position(
    *,
    fuel_before,
    fuel_added,
    fuel_after,
    recorded_consumption,
    loaded_km,
    empty_km,
    distance_km,
    odometer_start,
    odometer_end,
    gps_distance,
    planned_distance,
    norm_loaded,
    norm_empty,
) -> FuelPosition:
    position = FuelPosition()
    position.before_liters = _dec(fuel_before)
    position.added_liters = _dec(fuel_added)
    position.after_liters = _dec(fuel_after)
    position.gps_distance_km = _dec(gps_distance)
    position.planned_distance_km = _dec(planned_distance)

    # --- Masofa ---
    start = _dec(odometer_start)
    end = _dec(odometer_end)
    if start is not None and end is not None:
        if end < start:
            position.warnings.append(MSG_ODOMETER_BACKWARDS)
        else:
            position.odometer_distance_km = end - start
    # Odometrdan chiqqan masofa aniqroq: u o'lchov, qo'lda yozilgani esa
    # ko'pincha yo'nalish jadvalidan olingan taxmin.
    position.distance_km = position.odometer_distance_km or _dec(distance_km)

    if position.distance_km is not None and position.gps_distance_km is not None:
        position.gps_difference_km = position.distance_km - position.gps_distance_km
        if abs(position.gps_difference_km) > GPS_TOLERANCE_KM:
            position.warnings.append(MSG_GPS_MISMATCH)

    if position.distance_km is not None and position.planned_distance_km is not None:
        position.overrun_km = position.distance_km - position.planned_distance_km
        if position.overrun_km > OVERRUN_TOLERANCE_KM:
            position.warnings.append(MSG_OVERRUN)

    # --- Haqiqiy sarf ---
    # Bak hisobi bo'lsa, u ustun turadi: u o'lchov, qo'lda yozilgani esa
    # ko'pincha eslab qolingan raqam. Saqlashda `fuel_consumption_liters`
    # ham shu qiymatga tenglashtiriladi, ya'ni ikkita manba bir narsani
    # boshqa-boshqa ayta olmaydi.
    if position.before_liters is not None and position.after_liters is not None:
        added = position.added_liters or Decimal("0")
        position.actual_liters = position.before_liters + added - position.after_liters
    else:
        position.actual_liters = _dec(recorded_consumption)

    if position.actual_liters is not None and position.distance_km:
        position.liters_per_100km = (
            position.actual_liters / position.distance_km * Decimal("100")
        ).quantize(Decimal("0.01"))

    # --- Norma ---
    loaded = _dec(loaded_km)
    empty = _dec(empty_km)
    norm_l = _dec(norm_loaded)
    norm_e = _dec(norm_empty)
    if norm_l is None or norm_e is None:
        position.warnings.append(MSG_NORM_MISSING)
        return position
    if loaded is None and empty is None:
        # Umumiy masofani ikkiga bo'lish mumkin edi, lekin bu taxmin bo'lardi
        # va uning ustidan chiqadigan «ortiqcha sarf» raqamiga ishonib
        # bo'lmaydi -- odam esa unga ishonadi.
        position.warnings.append(MSG_MILEAGE_SPLIT_MISSING)
        return position

    loaded = loaded or Decimal("0")
    empty = empty or Decimal("0")
    position.norm_liters = ((loaded * norm_l + empty * norm_e) / Decimal("100")).quantize(Decimal("0.01"))
    if position.actual_liters is None:
        return position

    position.difference_liters = (position.actual_liters - position.norm_liters).quantize(Decimal("0.01"))
    if position.norm_liters > 0:
        position.difference_percent = (
            position.difference_liters / position.norm_liters * Decimal("100")
        ).quantize(Decimal("0.01"))
    position.tolerance_liters = (position.norm_liters * TOLERANCE_PERCENT / Decimal("100")).quantize(Decimal("0.01"))
    if position.difference_liters > 0:
        position.warnings.append(MSG_OVER_NORM)
        excess = position.difference_liters - position.tolerance_liters
        if excess > 0:
            position.suspected_liters = excess.quantize(Decimal("0.01"))
            position.warnings.append(MSG_SUSPECTED_SIPHONING)
    return position
