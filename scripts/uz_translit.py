"""Uzbek Latin -> Cyrillic transliteration.

Used by generate_cyrillic_dict.py to build the UI dictionary, and mirrored in
JS (frontend/src/config/cyrillic.js) for the runtime fallback used on toast
messages, which can carry interpolated values a dictionary can't match.

Latin stays the source of truth everywhere in this project; Cyrillic is
produced from it.
"""

import re

# Brand names and genuinely-Latin technical terms that stay Latin even in
# Cyrillic text. Matched on whole words only -- single letters must never go in
# here, or they'd be protected inside every word and fragment it.
# Uzbek/Russian-origin acronyms (INN, OKED, TTN, QQS...) are deliberately NOT
# here: they are normally written in Cyrillic (ИНН, ОКЭД), so they transliterate.
PROTECTED = [
    "UzYolButlash", "Bitum ERP", "MAN TGS", "Hikvision", "Telegram",
    "ERP", "PDF", "CSV", "XLSX", "Excel", "API", "ID", "SMS", "URL", "Email",
    # ISO currency codes are written in Latin in Uzbek Cyrillic text too --
    # "УЗС" is not a currency, it is a transliteration accident.
    "UZS", "USD", "EUR", "RUB", "KZT",
    # Names of outside systems, same reasoning as the brands above.
    "Didox", "Rouming", "MXIK", "IKPU", "STIR",
]

# Ordinary transliteration gets these wrong; fix them once here so the fix
# survives every regeneration of the dictionary.
OVERRIDES = {
    "Ijro": "Ижро",
    "Davomat": "Давомат",
    "Moliya": "Молия",
    "Sotuv": "Сотув",
    "Ta'minot": "Таъминот",
    "Xodimlar": "Ходимлар",
    "Yetkazib berish": "Етказиб бериш",
    "Hisobotlar": "Ҳисоботлар",
    "Boshqaruv paneli": "Бошқарув панели",
    "Foyda": "Фойда",
    "Pul oqimi": "Пул оқими",
    "Mijozlar": "Мижозлар",
    "Shartnomalar": "Шартномалар",
    "Buyurtmalar": "Буюртмалар",
    "Mahsulotlar": "Маҳсулотлар",
    "Talabnomalar": "Талабномалар",
    "Partiyalar": "Партиялар",
    "Logistika": "Логистика",
    "Transportlar": "Транспортлар",
    "Ta'minotchilar": "Таъминотчилар",
    "Xaridlar": "Харидлар",
    "Zaxira": "Захира",
    "Debitorlik": "Дебиторлик",
    "Kreditorlik": "Кредиторлик",
    "Bo'limlar": "Бўлимлар",
    "Operatsiyalar": "Операциялар",
    "Foydalanuvchilar": "Фойдаланувчилар",
    "Chiqish": "Чиқиш",
    "Saqlash": "Сақлаш",
    "Bekor qilish": "Бекор қилиш",
    "Tahrirlash": "Таҳрирлаш",
    "O'chirish": "Ўчириш",
    "Qo'shish": "Қўшиш",
    "Izoh": "Изоҳ",
    "Sana": "Сана",
    "Holat": "Ҳолат",
    "Amallar": "Амаллар",
    "Yangi": "Янги",
    "Yopish": "Ёпиш",
    "Orqaga": "Орқага",
    "Jami": "Жами",
    "Summa": "Сумма",
    "Miqdori": "Миқдори",
    "Narxi": "Нархи",
    "Yuklanmoqda...": "Юкланмоқда...",
}

# Longest-first so digraphs win over single letters.
_PAIRS = [
    ("o'", "ў"), ("O'", "Ў"), ("g'", "ғ"), ("G'", "Ғ"),
    ("sh", "ш"), ("Sh", "Ш"), ("SH", "Ш"),
    ("ch", "ч"), ("Ch", "Ч"), ("CH", "Ч"),
    ("ya", "я"), ("Ya", "Я"), ("YA", "Я"),
    ("yo", "ё"), ("Yo", "Ё"), ("YO", "Ё"),
    ("yu", "ю"), ("Yu", "Ю"), ("YU", "Ю"),
    ("ye", "е"), ("Ye", "Е"), ("YE", "Е"),
    ("ts", "ц"), ("Ts", "Ц"),
    ("a", "а"), ("b", "б"), ("d", "д"), ("e", "е"), ("f", "ф"), ("g", "г"),
    ("h", "ҳ"), ("i", "и"), ("j", "ж"), ("k", "к"), ("l", "л"), ("m", "м"),
    ("n", "н"), ("o", "о"), ("p", "п"), ("q", "қ"), ("r", "р"), ("s", "с"),
    ("t", "т"), ("u", "у"), ("v", "в"), ("x", "х"), ("y", "й"), ("z", "з"),
    ("c", "к"), ("w", "в"),
    ("A", "А"), ("B", "Б"), ("D", "Д"), ("E", "Е"), ("F", "Ф"), ("G", "Г"),
    ("H", "Ҳ"), ("I", "И"), ("J", "Ж"), ("K", "К"), ("L", "Л"), ("M", "М"),
    ("N", "Н"), ("O", "О"), ("P", "П"), ("Q", "Қ"), ("R", "Р"), ("S", "С"),
    ("T", "Т"), ("U", "У"), ("V", "В"), ("X", "Х"), ("Y", "Й"), ("Z", "З"),
    ("C", "К"), ("W", "В"),
]

_PROTECTED_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(p) for p in sorted(PROTECTED, key=len, reverse=True)) + r")\b"
)
# Anything that must survive verbatim: emails, URLs, {placeholders} and any
# token starting with a digit (money, dates, vehicle plates like 01A999ZZ).
_KEEP_RE = re.compile(
    r"[\w.+-]+@[\w-]+\.[\w.]+"        # email
    r"|https?://\S+"                   # url
    r"|\{\w+\}"                        # {placeholder}
    r"|\b\w+(?:_\w+)+\b"               # snake_case / CONST_CASE identifiers
    r"|\b\w+\.(?:env|md|py|js|json|csv|pdf)\b"   # file names
    r"|\b\d[\w.,/:-]*"                 # anything starting with a digit
)


def _translit_word(word: str) -> str:
    # Word-initial "e" is "э" (eslatma -> эслатма). Done up front on the Latin
    # text so the "e" inside a ye/yo digraph is never caught: in "Yetkazib" the
    # word boundary sits before the Y, not before the e.
    #
    # Apostrof so'z chegarasi hisoblanadi, shuning uchun «Ob'ekt» dagi e ham
    # so'z boshi deb olinar va «Объэкт» chiqardi. Tutuq belgisidan keyingi e
    # hech qachon so'z boshi emas.
    out = re.sub(r"(?<!['’])\be", "\x01", word)
    out = re.sub(r"(?<!['’])\bE", "\x02", out)
    for latin, cyr in _PAIRS:
        out = out.replace(latin, cyr)
    out = out.replace("\x01", "э").replace("\x02", "Э")
    # Tutuq belgisi: a leftover apostrophe becomes ъ (o'/g' already consumed).
    out = out.replace("'", "ъ").replace("’", "ъ")
    return out


def transliterate(text: str) -> str:
    """Latin Uzbek -> Cyrillic, leaving protected tokens and data-ish tokens alone."""
    if not text:
        return text

    # Carve the string into segments that must survive vs. segments to convert.
    keep_spans: list[tuple[int, int]] = []
    for rx in (_PROTECTED_RE, _KEEP_RE):
        for m in rx.finditer(text):
            keep_spans.append((m.start(), m.end()))
    keep_spans.sort()

    merged: list[tuple[int, int]] = []
    for start, end in keep_spans:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    result = []
    cursor = 0
    for start, end in merged:
        result.append(_translit_word(text[cursor:start]))
        result.append(text[start:end])
        cursor = end
    result.append(_translit_word(text[cursor:]))
    return "".join(result)


# Alohida so'zlar: OVERRIDES butun satrga mos kelgandagina ishlaydi, bular esa
# jumla ichida ham uchraydi. `ticket` -> «тиккет» bo'lib chiqardi, chunki `ck`
# ikkita harf sifatida o'giriladi.
WORD_FIXES = {
    "тиккет": "тикет",
    "Тиккет": "Тикет",
    "ТИККЕТ": "ТИКЕТ",
}

_WORD_FIX_RE = re.compile("|".join(re.escape(key) for key in WORD_FIXES))


def apply_word_fixes(text: str) -> str:
    return _WORD_FIX_RE.sub(lambda m: WORD_FIXES[m.group(0)], text)


def translate(text: str) -> str:
    """Override table first, then transliteration."""
    stripped = text.strip()
    if stripped in OVERRIDES:
        return text.replace(stripped, OVERRIDES[stripped])
    return apply_word_fixes(transliterate(text))
