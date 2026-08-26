"""Mashina yo'lga chiqishga tayyormi: hujjat muddatlari va TO gacha qolgani.

Texko'rik, sug'urta va ADR ruxsatnomasi muddati o'tib ketsa, mashina yo'lda
to'xtatiladi -- yuk bilan birga. Bu ERP da hech qayerda yozilmasdi: muddatlar
umuman saqlanmasdi, demak ular haqida ogohlantirish ham bo'lishi mumkin emas
edi. Xuddi shu narsa texnik xizmatga ham tegishli: oxirgi TO qaysi kilometrda
bo'lgani yozilmagach, keyingisiga qancha qolgani ham noma'lum.

Bu yerda hisoblanadi, saqlanmaydi. Keyingi TO ni maydonga yozib qo'yish
mumkin edi, lekin oraliq o'zgarganda yoki odometr yangilanganda eski hisob
qolib ketardi -- ekranda esa u to'g'ridek ko'rinardi.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

# Muddat tugashiga shuncha kun qolganda ogohlantiriladi. Sug'urta va texko'rik
# rasmiylashtirish uchun bir necha kun oladi, shuning uchun bir oy.
WARN_DAYS = 30
# TO gacha shuncha kilometr qolganda ogohlantiriladi -- bir-ikki reysga yetadi.
WARN_KM = Decimal("1000")

LEVEL_OK = "ok"
LEVEL_SOON = "soon"
LEVEL_EXPIRED = "expired"
LEVEL_UNKNOWN = "unknown"

# Xabar matnlari MSG_ bilan e'lon qilinadi -- lug'at generatori aynan shu
# nomdagi o'zgarmaslarni yig'adi.
MSG_TECH_INSPECTION = "Texnik ko'rik"
MSG_INSURANCE = "Sug'urta"
MSG_ADR = "ADR ruxsatnomasi"

# Har bir hujjat uchun uchta to'liq jumla. Ularni «yorliq + holat» qilib
# yig'ish qisqaroq bo'lardi, lekin natija lug'atda yo'q bo'lgan yangi satr
# bo'lib chiqadi va ekranda lotin alifbosida qolib ketadi: tarjima butun
# jumlaga qarab ishlaydi, bo'laklarga emas.
MSG_TECH_INSPECTION_EXPIRED = "Texnik ko'rik muddati o'tgan"
MSG_TECH_INSPECTION_SOON = "Texnik ko'rik muddati tugayapti"
MSG_TECH_INSPECTION_MISSING = "Texnik ko'rik muddati kiritilmagan"
MSG_INSURANCE_EXPIRED = "Sug'urta muddati o'tgan"
MSG_INSURANCE_SOON = "Sug'urta muddati tugayapti"
MSG_INSURANCE_MISSING = "Sug'urta muddati kiritilmagan"
MSG_ADR_EXPIRED = "ADR ruxsatnomasi muddati o'tgan"
MSG_ADR_SOON = "ADR ruxsatnomasi muddati tugayapti"
MSG_ADR_MISSING = "ADR ruxsatnomasi muddati kiritilmagan"

MSG_SERVICE_DUE = "Texnik xizmat muddati keldi"
MSG_SERVICE_SOON = "Texnik xizmatga oz qoldi"
MSG_SERVICE_UNKNOWN = "Texnik xizmat ma'lumoti kiritilmagan"
MSG_NORM_MISSING = "Yoqilg'i normasi kiritilmagan"

DOCUMENTS = (
    (
        "tech_inspection_until",
        MSG_TECH_INSPECTION,
        {
            LEVEL_EXPIRED: MSG_TECH_INSPECTION_EXPIRED,
            LEVEL_SOON: MSG_TECH_INSPECTION_SOON,
            LEVEL_UNKNOWN: MSG_TECH_INSPECTION_MISSING,
        },
    ),
    (
        "insurance_until",
        MSG_INSURANCE,
        {
            LEVEL_EXPIRED: MSG_INSURANCE_EXPIRED,
            LEVEL_SOON: MSG_INSURANCE_SOON,
            LEVEL_UNKNOWN: MSG_INSURANCE_MISSING,
        },
    ),
    (
        "adr_until",
        MSG_ADR,
        {
            LEVEL_EXPIRED: MSG_ADR_EXPIRED,
            LEVEL_SOON: MSG_ADR_SOON,
            LEVEL_UNKNOWN: MSG_ADR_MISSING,
        },
    ),
)

# Eng yomoni ustun keladi.
LEVEL_ORDER = {LEVEL_OK: 0, LEVEL_UNKNOWN: 1, LEVEL_SOON: 2, LEVEL_EXPIRED: 3}


@dataclass
class DocumentRow:
    key: str
    label: str
    until: date | None
    days_left: int | None
    level: str


@dataclass
class ServicePosition:
    interval_km: Decimal | None = None
    last_km: Decimal | None = None
    last_date: date | None = None
    next_km: Decimal | None = None
    current_km: Decimal | None = None
    remaining_km: Decimal | None = None
    level: str = LEVEL_UNKNOWN


@dataclass
class Readiness:
    documents: list[DocumentRow] = field(default_factory=list)
    service: ServicePosition = field(default_factory=ServicePosition)
    level: str = LEVEL_OK
    warnings: list[str] = field(default_factory=list)


def document_level(until: date | None, today: date) -> tuple[str, int | None]:
    if until is None:
        return LEVEL_UNKNOWN, None
    days_left = (until - today).days
    if days_left < 0:
        return LEVEL_EXPIRED, days_left
    if days_left <= WARN_DAYS:
        return LEVEL_SOON, days_left
    return LEVEL_OK, days_left


def build_service(transport, current_km: Decimal | None) -> ServicePosition:
    position = ServicePosition(
        interval_km=transport.service_interval_km,
        last_km=transport.last_service_km,
        last_date=transport.last_service_date,
        current_km=current_km,
    )
    if not transport.service_interval_km or transport.last_service_km is None:
        return position
    position.next_km = Decimal(transport.last_service_km) + Decimal(transport.service_interval_km)
    if current_km is None:
        # Oraliq ma'lum, lekin joriy odometr yo'q: keyingi TO qaysi
        # kilometrda ekanini ayta olamiz, qolganini emas.
        return position
    position.remaining_km = position.next_km - Decimal(current_km)
    if position.remaining_km <= 0:
        position.level = LEVEL_EXPIRED
    elif position.remaining_km <= WARN_KM:
        position.level = LEVEL_SOON
    else:
        position.level = LEVEL_OK
    return position


def build_readiness(transport, *, today: date, current_km: Decimal | None = None) -> Readiness:
    result = Readiness()
    for key, label, messages in DOCUMENTS:
        until = getattr(transport, key)
        level, days_left = document_level(until, today)
        result.documents.append(DocumentRow(key=key, label=label, until=until, days_left=days_left, level=level))
        message = messages.get(level)
        if message:
            result.warnings.append(message)

    result.service = build_service(transport, current_km)
    if result.service.level == LEVEL_EXPIRED:
        result.warnings.append(MSG_SERVICE_DUE)
    elif result.service.level == LEVEL_SOON:
        result.warnings.append(MSG_SERVICE_SOON)
    elif result.service.level == LEVEL_UNKNOWN:
        result.warnings.append(MSG_SERVICE_UNKNOWN)

    if not transport.fuel_norm_loaded or not transport.fuel_norm_empty:
        result.warnings.append(MSG_NORM_MISSING)

    levels = [row.level for row in result.documents] + [result.service.level]
    result.level = max(levels, key=lambda value: LEVEL_ORDER[value])
    return result
