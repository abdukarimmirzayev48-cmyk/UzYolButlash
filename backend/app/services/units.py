"""O'lchov birligini bir ko'rinishga keltirish.

Bitta tonna bazada uch xil yozilgan: «t», «tn», «tonna». Zaxira buyurtmaga
esa nom va birlikning aynan mos tushishi bo'yicha izlanardi -- natijada
buyurtmada «BND 50/70, tonna» yozilgan bo'lsa, omborda o'sha mahsulotning
«t» birligidagi 4654 tonnasi turgan bo'lsa ham «mavjud zaxira topilmadi»
deb chiqardi.

Yozuvlarni qayta yozmaymiz: eski hujjatlarda birlik qanday yozilgan
bo'lsa, shundayligicha qolishi kerak. Faqat solishtirishdan oldin bir
ko'rinishga keltiramiz.
"""

from __future__ import annotations

import re

# Bir xil narsani anglatuvchi yozuvlar. Kalitlar kichik harfda va
# tinish belgilarsiz.
UNIT_ALIASES = {
    "t": "t",
    "tn": "t",
    "ton": "t",
    "tonn": "t",
    "tonna": "t",
    "т": "t",
    "тн": "t",
    "тонна": "t",
    "kg": "kg",
    "kilogramm": "kg",
    "кг": "kg",
    "килограмм": "kg",
    "l": "l",
    "litr": "l",
    "л": "l",
    "литр": "l",
    "dona": "dona",
    "sht": "dona",
    "dn": "dona",
    "шт": "dona",
    "дона": "dona",
    "m3": "m3",
    "м3": "m3",
}


def normalize_unit(value: str | None) -> str:
    """«tonna», «t», «тн» -- hammasi bitta kalitga tushadi."""
    text = re.sub(r"[\s.]+", "", (value or "").strip().lower())
    if not text:
        return ""
    return UNIT_ALIASES.get(text, text)


def normalize_product(value: str | None) -> str:
    """Mahsulot nomi: ortiqcha bo'shliq va registr farqi hisobga olinmaydi."""
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def same_product(name_a: str | None, unit_a: str | None,
                 name_b: str | None, unit_b: str | None) -> bool:
    """Ikki yozuv bir xil mahsulotni ko'rsatyaptimi."""
    return (
        normalize_product(name_a) == normalize_product(name_b)
        and normalize_unit(unit_a) == normalize_unit(unit_b)
    )
