"""Qabul qilingan miqdor yuklanganidan kam chiqsa, farq bilan nima bo'ladi.

250 tonna yuklandi, 248 tonna qabul qilindi. Farq to'g'ri hisoblandi va partiya
«miqdor farqi bor» deb belgilandi -- va shu yerda to'xtadi. Partiya yakunlandi,
lekin 2 tonna buyurtmada abadiy «yo'lda, qabul qilinmagan» bo'lib qoldi:
`in_transit_quantity` yuklangandan qabul qilinganni ayirib hisoblanardi va
yakunlangan partiyada bu ayirma hech qachon yopilmasdi. Fakturasi esa 250
tonnaga qo'yilgan edi, ya'ni mijozdan 2 tonna uchun ortiqcha pul so'ralgan.

Farq -- texnik xato emas, tijorat qarori: qaytariladimi, qayta jo'natiladimi,
kredit-nota chiqariladimi yoki hisobdan chiqariladimi. Shuning uchun bu yerda
qaror turlari va ularning pul qiymati hisoblanadi, qarorning o'zini esa odam
qabul qiladi.

Pul qiymati buyurtma qatoridagi narx bo'yicha, QQS bilan hisoblanadi -- mijozga
aynan shu narxda faktura qo'yilgan.
"""

from dataclasses import dataclass
from decimal import Decimal

# Bir tonnadan kichik farq -- partiyalar orasidagi yaxlitlash, kamomad emas.
TOLERANCE = Decimal("0.001")

RETURN_TO_SUPPLIER = "return_to_supplier"
RESHIP = "reship"
CREDIT_NOTE = "credit_note"
WRITE_OFF = "write_off"

RESOLUTIONS = (RETURN_TO_SUPPLIER, RESHIP, CREDIT_NOTE, WRITE_OFF)

RESOLUTION_LABELS = {
    RETURN_TO_SUPPLIER: "Ta'minotchiga qaytariladi",
    RESHIP: "Qayta jo'natiladi",
    CREDIT_NOTE: "Kredit-nota chiqariladi",
    WRITE_OFF: "Hisobdan chiqariladi",
}

MSG_RESOLUTION_REQUIRED = "Qabul farqi bor: nima qilinishini tanlang"
MSG_UNRESOLVED = "Qabul farqi bo'yicha qaror qabul qilinmagan"
MSG_CREDIT_NOTE_DUE = "Kredit-nota chiqarilishi kerak"
MSG_ACCEPTED_OVER_LOADED = "Qabul qilingan miqdor yuklanganidan ko'p"


@dataclass
class Difference:
    quantity: Decimal = Decimal("0")
    amount: Decimal = Decimal("0")
    resolution: str | None = None

    @property
    def exists(self) -> bool:
        return abs(self.quantity) > TOLERANCE

    @property
    def is_resolved(self) -> bool:
        return self.resolution is not None


def quantity_text(value: Decimal) -> str:
    text = f"{value:,.3f}".rstrip("0").rstrip(".")
    return text.replace(",", " ")


def money_text(value: Decimal) -> str:
    """Valyuta so'zisiz: ogohlantirishning qiymat qismi tarjima qilinmaydi,
    shuning uchun lotincha «so'm» kirill jumla ichida qolib ketardi."""
    return f"{value:,.0f}".replace(",", " ")


def line_amount(*, quantity: Decimal, unit_price: Decimal, vat_rate: Decimal) -> Decimal:
    factor = Decimal("1") + Decimal(vat_rate or 0) / Decimal("100")
    return (Decimal(quantity) * Decimal(unit_price or 0) * factor).quantize(Decimal("0.01"))


def build_difference(*, items: list[dict], resolution: str | None = None) -> Difference:
    """`items` -- partiya qatorlari:
    {loaded_quantity, accepted_quantity, unit_price, vat_rate}.

    accepted_quantity None bo'lsa, qator hali o'lchanmagan: farq ham yo'q.
    """
    difference = Difference(resolution=resolution)
    for item in items:
        accepted = item.get("accepted_quantity")
        if accepted is None:
            continue
        loaded = Decimal(item.get("loaded_quantity") or 0)
        shortfall = loaded - Decimal(accepted)
        if not shortfall:
            continue
        difference.quantity += shortfall
        difference.amount += line_amount(
            quantity=shortfall,
            unit_price=item.get("unit_price") or 0,
            vat_rate=item.get("vat_rate") or 0,
        )
    return difference


def warnings_for(difference: Difference) -> list[str]:
    if not difference.exists:
        return []
    if difference.quantity < 0:
        return [f"{MSG_ACCEPTED_OVER_LOADED}: {quantity_text(abs(difference.quantity))}"]
    if not difference.is_resolved:
        return [f"{MSG_UNRESOLVED}: {quantity_text(difference.quantity)}"]
    if difference.resolution == CREDIT_NOTE:
        return [f"{MSG_CREDIT_NOTE_DUE}: {money_text(difference.amount)}"]
    return []
