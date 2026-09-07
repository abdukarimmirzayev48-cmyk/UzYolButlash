"""Reysni yopishdan oldin nima kiritilgan bo'lishi kerak.

Yoqilg'i va yuk nazorati maydonlari bor edi, lekin ularni hech narsa
so'ramasdi: reys «Yakunlandi» holatiga o'tardi, bak qoldig'i ham, odometr
ham, tarozi ham bo'sh qolaverardi. Keyin esa bu raqamlarni tiklab
bo'lmaydi -- mashina yo'lda, tarozi ko'rsatkichi o'chgan.

Talab ikki darajali:

* **To'sadigan** -- o'z mashinamiz bo'lsa odometr. Bu raqam har doim bor,
  uni yozmaslikning sababi yo'q, usiz esa butun yoqilg'i hisobi ishlamaydi.
* **So'raydigan** -- bak qoldig'i va tarozi. Ba'zi reysda ular haqiqatan
  bo'lmaydi (tashuvchi mashinasi, tarozisiz nuqta), shuning uchun yo'l
  ochiq qoladi: foydalanuvchi ataylab o'tkazib yuboradi va bu yakunlash
  izohiga yoziladi.

Begona tashuvchi mashinasida odometr ham, bak ham bizniki emas -- ulardan
so'ralmaydi.
"""

from dataclasses import dataclass, field

MSG_ODOMETER_REQUIRED = "Reysni yakunlash uchun odometr ko'rsatkichlarini kiriting"
MSG_FUEL_MISSING = "Bak qoldig'i kiritilmagan"
MSG_SCALE_MISSING = "Tarozi ko'rsatkichi kiritilmagan"
MSG_TRIP_DATA_MISSING = "Reys raqamlari to'liq kiritilmagan"
MSG_TRIP_DATA_SKIPPED = "Reys raqamlarisiz yakunlandi"


@dataclass
class TripCheck:
    blocking: list[str] = field(default_factory=list)
    soft: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.blocking and not self.soft


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def check_trip(*, own_vehicle: bool, odometer_start, odometer_end, fuel_before, fuel_after, gross_weight, tare_weight) -> TripCheck:
    result = TripCheck()
    if own_vehicle:
        if _blank(odometer_start) or _blank(odometer_end):
            result.blocking.append(MSG_ODOMETER_REQUIRED)
        if _blank(fuel_before) or _blank(fuel_after):
            result.soft.append(MSG_FUEL_MISSING)
    if _blank(gross_weight) or _blank(tare_weight):
        result.soft.append(MSG_SCALE_MISSING)
    return result
