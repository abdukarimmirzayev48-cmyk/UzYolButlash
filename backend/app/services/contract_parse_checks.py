"""Plausibility checks for a parsed contract, and the confidence built on them.

Confidence used to be "how many of the eight required fields came back
non-empty", which says nothing about whether what came back is a contract.
A parse that produced a Didox id of "//my", a catalog code of "у", a unit price
of 1.00 and a 11.2 so'm total for ten tonnes of bitumen scored 100% -- and the
review screen told the operator, in the largest text on the page, that it was
100% certain. A wrong number nobody checks is worse than a missing one.

So each field is now judged on whether its value could be true, and the score
counts only the ones that pass. Values that are obviously debris are dropped
rather than stored: an operator can fill an empty field, but has no way of
knowing that "//my" is not a document id.
"""

import re
from datetime import date
from decimal import Decimal

# Uzbek company identifiers are exactly nine digits.
INN_RE = re.compile(r"^\d{9}$")
# Didox and Rouming both hand out 32-character hex ids; some are printed with
# the UUID dashes in place.
DOCUMENT_ID_RE = re.compile(r"^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
# MXIK / IKPU catalog codes are seventeen digits.
CATALOG_CODE_RE = re.compile(r"^\d{17}$")

# A bitumen supply contract below this is not a contract, it is a misread
# number: the smallest real one on file is in the hundreds of millions.
MIN_CONTRACT_TOTAL = Decimal("100000")
# One tonne of road bitumen costs millions of so'm. A price under this means the
# quantity and price columns were read out of the wrong cells.
MIN_UNIT_PRICE = Decimal("1000")


# Warnings are built as "<fixed sentence>: <value>". The sentence is a plain
# literal so the Cyrillic dictionary can match it whole; the value is whatever
# the document said and is shown untranslated, because transliterating a hex id
# or a catalog code would turn data into nonsense.
MSG_NO_NUMBER = "Shartnoma raqami aniqlanmadi."
MSG_NO_DATE = "Shartnoma sanasi aniqlanmadi."
MSG_NO_VALID_UNTIL = "Amal qilish muddati aniqlanmadi."
MSG_BAD_VALID_UNTIL = "Amal qilish muddati shartnoma sanasidan keyin emas — tekshiring."
MSG_NO_CUSTOMER = "Buyurtmachi nomi aniqlanmadi."
MSG_NO_EXECUTOR = "Bajaruvchi nomi aniqlanmadi."
MSG_NO_CUSTOMER_INN = "Buyurtmachi STIR aniqlanmadi."
MSG_NO_EXECUTOR_INN = "Bajaruvchi STIR aniqlanmadi."
MSG_NO_PRODUCT = "Mahsulot nomi aniqlanmadi."
MSG_NO_QUANTITY = "Mahsulot miqdori aniqlanmadi."
MSG_BAD_QUANTITY = "Mahsulot miqdori 0 dan katta emas."
MSG_NO_UNIT_PRICE = "Birlik narxi aniqlanmadi."
MSG_NO_TOTAL = "Umumiy summa aniqlanmadi."
MSG_BAD_DOCUMENT_ID = "Hujjat ID formatga mos emas — bo'sh qoldirildi"
MSG_UNREADABLE_NAME = "Nomni o'qib bo'lmadi — bo'sh qoldirildi"
MSG_BAD_NUMBER = "Shartnoma raqami ishonchsiz — tekshiring"
MSG_TRUNCATED_CUSTOMER = "Buyurtmachi nomi to'liq emasga o'xshaydi — tekshiring"
MSG_TRUNCATED_EXECUTOR = "Bajaruvchi nomi to'liq emasga o'xshaydi — tekshiring"
MSG_BAD_CUSTOMER_INN = "Buyurtmachi STIR 9 xonali emas"
MSG_BAD_EXECUTOR_INN = "Bajaruvchi STIR 9 xonali emas"
MSG_BAD_PRODUCT = "Mahsulot nomi ishonchsiz — tekshiring"
MSG_SMALL_UNIT_PRICE = "Birlik narxi juda kichik — ustunlar noto'g'ri o'qilgan bo'lishi mumkin"
MSG_SMALL_TOTAL = "Shartnoma summasi juda kichik — tekshiring"


def has_letters(value: str | None, minimum: int = 3) -> bool:
    return bool(value) and len(re.sub(r"[^A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]", "", value)) >= minimum


def clean_document_id(value: str | None) -> tuple[str | None, str | None]:
    """Keep a document id only if it looks like one.

    The pattern that produced "//my" matched the tail of the Didox URL printed
    in the footer, so the field looked filled and was wrong.
    """
    if not value:
        return None, None
    candidate = value.strip().replace("-", "") if "-" in value else value.strip()
    if DOCUMENT_ID_RE.match(value.strip()) or re.fullmatch(r"[0-9a-fA-F]{32}", candidate):
        return value.strip(), None
    return None, f"{MSG_BAD_DOCUMENT_ID}: {value.strip()}"


def clean_catalog_code(value: str | None, label: str) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    digits = re.sub(r"\D", "", value)
    if CATALOG_CODE_RE.match(digits):
        return digits, None
    return None, f"{label} 17 xonali kod emas — bo'sh qoldirildi: {value.strip()}"


# Quote-like characters the extractor picks up from the surrounding text. The
# backtick is how these PDFs render the Uzbek apostrophe, so it is corrected
# inside the name rather than stripped.
STRAY_EDGE_CHARS = "\"'«»“”„`´ \t,;:-"


def clean_party_name(value: str | None) -> tuple[str | None, str | None]:
    """Trim quote debris off a company name and normalise the apostrophe.

    The section heading around the name is quoted, so the extractor kept the
    opening quote: `"O`ZYO`LBUTLASH RESPUBLIKA TA`MINOT`. The stray character
    is safe to remove; a name that is *still* implausible afterwards is
    reported rather than guessed at.
    """
    if not value:
        return None, None
    cleaned = value.strip()
    # Only an unpaired quote is debris. Stripping every edge quote turned
    # «Ўзйўлкўприк» кластери into Ўзйўлкўприк» кластери -- tidier at one end and
    # broken at the other.
    for opening, closing in (("«", "»"), ("“", "”")):
        if cleaned.startswith(opening) and cleaned.count(closing) < cleaned.count(opening):
            cleaned = cleaned[1:].strip()
        if cleaned.endswith(closing) and cleaned.count(opening) < cleaned.count(closing):
            cleaned = cleaned[:-1].strip()
    # A straight quote opens and closes with the same character, so "unpaired"
    # means an odd number of them.
    for symmetric in ('"', "'"):
        if cleaned.count(symmetric) % 2 == 1:
            if cleaned.startswith(symmetric):
                cleaned = cleaned[1:].strip()
            elif cleaned.endswith(symmetric):
                cleaned = cleaned[:-1].strip()
    cleaned = cleaned.strip(" \t,;:-")
    # These documents print the Uzbek apostrophe as a backtick.
    cleaned = cleaned.replace("`", "'")
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    if not cleaned:
        return None, f"{MSG_UNREADABLE_NAME}: {value.strip()}"
    note = None
    if cleaned != value.strip():
        note = None  # a silent tidy-up; nothing for the operator to do
    return cleaned, note


def name_looks_truncated(value: str | None) -> bool:
    """A company name cut mid-title.

    These names end in a legal form -- korxonasi, boshqarmasi, MCHJ, AJ, DUK.
    Ending on a bare word like "TA'MINOT" or "Davlat" means the extractor
    stopped at a line break.
    """
    if not value:
        return False
    endings = (
        "korxonasi", "boshqarmasi", "korxona", "mchj", "aj", "duk", "atj", "xk",
        "корхонаси", "бошқармаси", "бошкармаси", "мчж", "аж", "дук",
        "xizmati", "хизмати", "markazi", "маркази", "instituti", "институти",
        "klasteri", "кластери", "respublikasi", "республикаси", "direksiyasi", "дирекцияси",
    )
    tail = value.strip().lower().rstrip(".").split()[-1] if value.strip() else ""
    return bool(tail) and not any(tail.endswith(e) for e in endings)


def field_checks(result) -> list[tuple[str, bool, str | None]]:
    """(field, plausible, warning) for every field the score is built from.

    A missing value and an implausible one are reported differently, because
    they need different work: one has to be typed in, the other has to be
    corrected against the document.
    """
    item = result.items[0] if result.items else {}
    checks: list[tuple[str, bool, str | None]] = []

    def add(field: str, value, ok: bool, missing: str, wrong: str) -> None:
        if value in (None, ""):
            checks.append((field, False, missing))
        elif not ok:
            checks.append((field, False, wrong))
        else:
            checks.append((field, True, None))

    number = result.contract_number
    add("contract_number", number, bool(number and re.search(r"\d", number)),
        MSG_NO_NUMBER,
        f"{MSG_BAD_NUMBER}: {number}")

    add("contract_date", result.contract_date, True,
        MSG_NO_DATE, "")

    valid_until = result.valid_until
    add("valid_until", valid_until,
        bool(valid_until and result.contract_date and valid_until > result.contract_date),
        MSG_NO_VALID_UNTIL,
        MSG_BAD_VALID_UNTIL)

    customer = result.customer.get("name")
    add("customer_name", customer, has_letters(customer) and not name_looks_truncated(customer),
        MSG_NO_CUSTOMER,
        f"{MSG_TRUNCATED_CUSTOMER}: {customer}")

    executor = result.executor.get("name")
    add("executor_name", executor, has_letters(executor) and not name_looks_truncated(executor),
        MSG_NO_EXECUTOR,
        f"{MSG_TRUNCATED_EXECUTOR}: {executor}")

    customer_inn = result.customer.get("inn")
    add("customer_inn", customer_inn, bool(customer_inn and INN_RE.match(str(customer_inn).strip())),
        MSG_NO_CUSTOMER_INN,
        f"{MSG_BAD_CUSTOMER_INN}: {customer_inn}")

    executor_inn = result.executor.get("inn")
    add("executor_inn", executor_inn, bool(executor_inn and INN_RE.match(str(executor_inn).strip())),
        MSG_NO_EXECUTOR_INN,
        f"{MSG_BAD_EXECUTOR_INN}: {executor_inn}")

    product = item.get("product_name")
    add("product_name", product, has_letters(product),
        MSG_NO_PRODUCT,
        f"{MSG_BAD_PRODUCT}: {product}")

    quantity = item.get("quantity")
    add("quantity", quantity, bool(quantity and quantity > 0),
        MSG_NO_QUANTITY,
        MSG_BAD_QUANTITY)

    unit_price = item.get("unit_price")
    add("unit_price", unit_price, bool(unit_price and unit_price >= MIN_UNIT_PRICE),
        MSG_NO_UNIT_PRICE,
        f"{MSG_SMALL_UNIT_PRICE}: {unit_price}")

    total = result.totals.get("total_with_vat")
    add("total_with_vat", total, bool(total and total >= MIN_CONTRACT_TOTAL),
        MSG_NO_TOTAL,
        f"{MSG_SMALL_TOTAL}: {total}")

    return checks


def confidence_and_warnings(result) -> tuple[Decimal, list[str]]:
    """Score plus the reasons it is not higher.

    Only checks that actually passed count towards the score, so a parse that
    filled every field with debris scores low rather than perfect.
    """
    checks = field_checks(result)
    passed = sum(1 for _field, ok, _warning in checks if ok)
    warnings = [warning for _field, ok, warning in checks if not ok and warning]
    score = (Decimal(passed) / Decimal(len(checks))).quantize(Decimal("0.01"))
    return score, warnings
