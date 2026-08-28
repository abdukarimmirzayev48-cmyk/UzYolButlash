"""Yuk nazorati: tarozi, plomba va temperatura.

Miqdor ilgari faqat bitta joyda -- partiya bandlarida -- yozilardi va u
qo'lda kiritilgan raqam edi. Tarozi ko'rsatkichi esa boshqa narsa: brutto
bilan tara o'lchov, ular orasidagi farq esa haqiqatan yuklangan miqdor.
Ikkovi bir-biriga mos kelmasa, yo tarozi, yo hujjat noto'g'ri -- va buni
ob'ektda emas, yuklashda bilish kerak.

Bitum sovuydi. Sovib qolgan bitum bilan yo'l qoplamasi yotqizib bo'lmaydi,
shuning uchun temperatura yuk hujjatining bir qismi va u ikki uchida ham
o'lchanadi. Quyidagi chegaralar BND markalari uchun odatiy qiymatlar,
lekin ular texnik qaror: markaga va yilning fasliga qarab o'zgaradi va
shu yerdan o'zgartiriladi.

Plomba raqami yuklashda qo'yiladi va tushirishda yoziladi. Ular boshqa
bo'lsa, sisterna yo'lda ochilgan degani -- bu miqdor farqidan ko'ra
qattiqroq dalil.
"""

from dataclasses import dataclass, field
from decimal import Decimal

# Tarozidan chiqqan miqdor hujjatdagidan shuncha tonnaga farq qilishi
# mumkin: tarozi xatosi va qoldiq bitum.
WEIGHT_TOLERANCE_TONS = Decimal("0.2")

# Yuklash va tushirish temperaturasi chegaralari, °C.
MIN_LOADING_TEMPERATURE = Decimal("140")
MAX_LOADING_TEMPERATURE = Decimal("180")
MIN_UNLOADING_TEMPERATURE = Decimal("120")

MSG_WEIGHT_MISMATCH = "Tarozi va hujjat miqdori mos emas"
MSG_TARE_TOO_BIG = "Tara brutto vaznidan katta"
MSG_SEAL_MISMATCH = "Yuklash va tushirish plombasi boshqa"
MSG_SEAL_MISSING = "Plomba raqami yozilmagan"
MSG_LOADING_TEMP_LOW = "Yuklash temperaturasi past"
MSG_LOADING_TEMP_HIGH = "Yuklash temperaturasi yuqori"
MSG_UNLOADING_TEMP_LOW = "Tushirish temperaturasi past"
MSG_TEMPERATURE_MISSING = "Temperatura o'lchanmagan"


@dataclass
class CargoPosition:
    gross_weight_tons: Decimal | None = None
    tare_weight_tons: Decimal | None = None
    net_weight_tons: Decimal | None = None
    # Partiya bandlarida yozilgan yuklangan miqdor.
    document_quantity: Decimal | None = None
    weight_difference_tons: Decimal | None = None
    loading_seal: str | None = None
    unloading_seal: str | None = None
    seals_match: bool | None = None
    loading_temperature_c: Decimal | None = None
    unloading_temperature_c: Decimal | None = None
    temperature_drop_c: Decimal | None = None
    warnings: list[str] = field(default_factory=list)


def _dec(value) -> Decimal | None:
    return None if value is None or value == "" else Decimal(value)


def build_position(*, logistics, document_quantity=None) -> CargoPosition:
    position = CargoPosition()
    position.gross_weight_tons = _dec(logistics.gross_weight_tons)
    position.tare_weight_tons = _dec(logistics.tare_weight_tons)
    position.loading_seal = (logistics.loading_seal or "").strip() or None
    position.unloading_seal = (logistics.unloading_seal or "").strip() or None
    position.loading_temperature_c = _dec(logistics.loading_temperature_c)
    position.unloading_temperature_c = _dec(logistics.unloading_temperature_c)
    position.document_quantity = _dec(document_quantity)

    # --- Tarozi ---
    if position.gross_weight_tons is not None and position.tare_weight_tons is not None:
        if position.tare_weight_tons > position.gross_weight_tons:
            position.warnings.append(MSG_TARE_TOO_BIG)
        else:
            position.net_weight_tons = (position.gross_weight_tons - position.tare_weight_tons).quantize(Decimal("0.001"))
    if position.net_weight_tons is not None and position.document_quantity is not None:
        position.weight_difference_tons = (position.net_weight_tons - position.document_quantity).quantize(Decimal("0.001"))
        if abs(position.weight_difference_tons) > WEIGHT_TOLERANCE_TONS:
            position.warnings.append(MSG_WEIGHT_MISMATCH)

    # --- Plomba ---
    if position.loading_seal and position.unloading_seal:
        position.seals_match = position.loading_seal.casefold() == position.unloading_seal.casefold()
        if not position.seals_match:
            position.warnings.append(MSG_SEAL_MISMATCH)
    elif position.loading_seal or position.unloading_seal:
        position.warnings.append(MSG_SEAL_MISSING)

    # --- Temperatura ---
    if position.loading_temperature_c is None and position.unloading_temperature_c is None:
        position.warnings.append(MSG_TEMPERATURE_MISSING)
    if position.loading_temperature_c is not None:
        if position.loading_temperature_c < MIN_LOADING_TEMPERATURE:
            position.warnings.append(MSG_LOADING_TEMP_LOW)
        elif position.loading_temperature_c > MAX_LOADING_TEMPERATURE:
            position.warnings.append(MSG_LOADING_TEMP_HIGH)
    if position.unloading_temperature_c is not None and position.unloading_temperature_c < MIN_UNLOADING_TEMPERATURE:
        position.warnings.append(MSG_UNLOADING_TEMP_LOW)
    if position.loading_temperature_c is not None and position.unloading_temperature_c is not None:
        position.temperature_drop_c = (position.loading_temperature_c - position.unloading_temperature_c).quantize(Decimal("0.1"))
    return position
