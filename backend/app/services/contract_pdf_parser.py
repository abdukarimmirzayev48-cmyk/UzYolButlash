from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from backend.app.services import contract_parse_checks


PARSER_VERSION = "rule-based-2026-07-05"


@dataclass
class ParsedContractResult:
    contract_number: str | None = None
    contract_date: str | None = None
    valid_until: str | None = None
    place: str | None = None
    executor: dict = field(default_factory=dict)
    customer: dict = field(default_factory=dict)
    items: list[dict] = field(default_factory=list)
    totals: dict = field(default_factory=dict)
    payment_terms: dict = field(default_factory=dict)
    document_ids: dict = field(default_factory=dict)
    transport_cost_separate: bool = False
    warnings: list[str] = field(default_factory=list)
    confidence: Decimal = Decimal("0")
    raw_text: str = ""
    parser_version: str = PARSER_VERSION

    def to_dict(self) -> dict:
        data = asdict(self)
        data["confidence"] = float(self.confidence)
        return data


def normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\u202f", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf_text(file_path: str | Path) -> str:
    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("pypdf kutubxonasi o'rnatilmagan.") from exc

    reader = PdfReader(str(file_path))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return normalize_text("\n".join(parts))


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"(\d{2})[.](\d{2})[.](\d{4})", value)
    if not match:
        return None
    day, month, year = match.groups()
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return None


UZBEK_MONTHS = {
    "yanvar": 1, "fevral": 2, "mart": 3, "aprel": 4, "may": 5, "iyun": 6,
    "iyul": 7, "avgust": 8, "sentyabr": 9, "sentabr": 9, "oktyabr": 10,
    "oktabr": 10, "noyabr": 11, "dekabr": 12,
}


def parse_uzbek_prose_date(text: str) -> str | None:
    """Parse dates like "2026-yilning 31-dekabrigacha" (year first, then day-month)."""
    match = re.search(
        r"(\d{4})[-\s]*yil\w*\s+(\d{1,2})[-\s]*("
        + "|".join(UZBEK_MONTHS) + r")\w*",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    year, day, month_name = match.groups()
    month = UZBEK_MONTHS.get(month_name.lower())
    if not month:
        return None
    try:
        return date(int(year), month, int(day)).isoformat()
    except ValueError:
        return None


def date_near_keyword(text: str, keywords: list[str], window: int = 40) -> str | None:
    """Find a DD.MM.YYYY date with one of `keywords` in its immediate neighborhood.

    Checks each date occurrence's own small window rather than searching the
    whole text greedily — a loose "date ... keyword" search can bridge across
    an unrelated earlier date to reach the keyword. Safer than "just take the
    last date in the document" too: a Didox-exported PDF often has an
    unrelated digital-signature timestamp near the end that would otherwise
    get mistaken for the contract's actual validity date.
    """
    for date_match in re.finditer(r"\d{2}\.\d{2}\.\d{4}", text):
        neighborhood = text[max(0, date_match.start() - window):date_match.end() + window]
        if any(re.search(keyword, neighborhood, re.IGNORECASE) for keyword in keywords):
            parsed = parse_date(date_match.group())
            if parsed:
                return parsed
    return None


def parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^\d,.\-]", "", value).replace(",", ".")
    if cleaned.count(".") > 1:
        head, tail = cleaned.rsplit(".", 1)
        cleaned = head.replace(".", "") + "." + tail
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def first(patterns: list[str], text: str, flags: int = re.IGNORECASE | re.MULTILINE) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            value = next((group for group in match.groups() if group), None)
            if value:
                return value.strip(" ,;:\n\t")
    return None


def amount_after(label_patterns: list[str], text: str) -> Decimal | None:
    # \b after the label prevents e.g. "миқдор" from matching inside an
    # unrelated word like "миқдорига" (a different clause entirely) and then
    # grabbing whatever number happens to follow within the search window.
    # The value group is non-greedy and requires a decimal part ([.,]\d+) so
    # it stops at the first complete number instead of swallowing several
    # space-separated amounts in a row (e.g. a totals line listing subtotal,
    # VAT, and grand total back to back) as one giant concatenated digit run.
    value = first([rf"{label}\b[^0-9]{{0,80}}([0-9][0-9\s]*?[.,]\d+)" for label in label_patterns], text)
    return parse_decimal(value)


def extract_section(text: str, starts: list[str], ends: list[str]) -> str:
    start_match = None
    for marker in starts:
        start_match = re.search(marker, text, re.IGNORECASE)
        if start_match:
            break
    if not start_match:
        return ""
    tail = text[start_match.start():]
    end_positions = []
    for marker in ends:
        end_match = re.search(marker, tail[start_match.end() - start_match.start():], re.IGNORECASE)
        if end_match:
            end_positions.append(start_match.end() - start_match.start() + end_match.start())
    end = min(end_positions) if end_positions else min(len(tail), 2500)
    return tail[:end]


def find_requisites_block(text: str) -> str:
    """Return the text from the dedicated party-requisites heading to the end.

    Party names (Буюртмачи/Заказчик, Бажарувчи/Исполнитель) are typically
    mentioned once in the opening paragraph and then again as headings right
    before each party's real INN/address/bank block near the end of the
    document. Scoping to this heading avoids extract_section() latching onto
    the first, requisites-free mention in the opening paragraph.
    """
    match = re.search(
        r"(?:Юридические адреса и реквизиты сторон|реквизиты сторон|"
        r"manzil\w*\s+va\s+rekvizit\w*)",
        text,
        re.IGNORECASE,
    )
    return text[match.end():] if match else ""


def parse_requisites(section: str) -> dict:
    return {
        "name": first([
            r'"([^"]{8,255})"',
            r"([A-ZА-ЯЁЎҚҒҲ0-9`'‘’\-\s]{8,255}(?:DM|МЧЖ|MCHJ|ДУК|ДМ|DAVLAT MUASSASASI|КОРХОНАСИ))",
        ], section),
        "director_full_name": first([
            r"(?:директор|rahbar|раҳбар)[^\n:]*[:\-]?\s*([A-ZА-ЯЁЎҚҒҲ][^\n,;]{5,120})",
        ], section),
        "inn": first([r"(?:СТИР|STIR|ИНН|INN)[^\d]{0,20}(\d{6,12})"], section),
        "oked": first([r"(?:ОКЭД|OKED)[^\d]{0,20}(\d{3,8})"], section),
        "legal_address": first([
            r"(?:манзил|адрес|address)[^\n:]*[:\-]?\s*([^\n]{10,240})",
        ], section),
        "bank_account": first([
            r"(?:ҳ/?р|р/?с|hisob raqami|расчетный счет)[^\d]{0,20}(\d{16,30})",
        ], section),
        "bank_name": first([
            r"(?:банк|bank)[^\n:]*[:\-]?\s*([^\n]{4,160})",
        ], section),
        "mfo": first([r"(?:МФО|MFO)[^\d]{0,20}(\d{3,8})"], section),
        "phone": first([r"(?:тел|telefon|phone)[^\d+]{0,20}(\+?\d[\d\s()\-]{6,})"], section),
    }


def parse_paired_labeled_requisites(text: str) -> tuple[dict, dict] | None:
    """Parse a "IJROCHI / BUYURTMACHI"-style requisites block.

    Some e-contract templates print both party headings adjacent to each
    other (e.g. "IJROCHI\nBUYURTMACHI") and then list each labeled field
    (Nomi:/Manzili:/STIR:/...) twice in a row — once per party — instead of
    grouping each party's fields under its own heading. extract_section()
    can't split that (there's no per-party marker between the two data
    blocks), so instead take every occurrence of each label and pair them up:
    first occurrence -> executor, second -> customer.
    """
    field_patterns = {
        "name": r"Nomi:\s*([^\n]+)",
        "legal_address": r"Manzili:\s*([^\n]+)",
        "phone": r"Tel:\s*([^\n]+)",
        "inn": r"STIR:\s*(\d{6,12})",
        "bank_account": r"Hisobraqam:\s*(\d{6,30})",
        "bank_name": r"Bank:\s*([^\n]+)",
        "mfo": r"MFO:\s*(\d{3,8})",
    }
    matches = {key: [m.strip() for m in re.findall(pattern, text, re.IGNORECASE)] for key, pattern in field_patterns.items()}
    if len(matches.get("name", [])) < 2:
        return None

    def pick(index: int) -> dict:
        row = {key: (values[index] if len(values) > index else None) for key, values in matches.items()}
        row["director_full_name"] = None
        row["oked"] = None
        return row

    return pick(0), pick(1)


def numbers_after_unit(text: str, window: int = 200) -> list[Decimal]:
    """Fallback for pure-table templates where a header label (e.g. "Soni" /
    "Кол-во") sits far from its data cell — pypdf dumps the whole header row,
    then the whole data row, so amount_after()'s "label near value" search
    either misses entirely or grabs an unrelated number from whatever text
    happens to be within its search window.

    Instead, anchor on the unit token (тонна/tonna/t) and read the formatted
    numbers that follow it in sequence. Every real amount in these tables
    always has a decimal part (150.00000, 5 303 600.00, 48,0 ...) — internal
    spaces are thousands separators, not number boundaries — so requiring a
    trailing [.,]\\d+ on each token reliably tells one number from the next
    even when they're separated by spaces rather than newlines. A bare
    integer like a "12 %" VAT rate has no decimal part and is skipped.

    Tries every occurrence of the unit token, not just the first: pypdf
    sometimes glues the table's own unit cell onto the previous column with
    no space ("битумиtonna"), which a strict \\b match skips right past,
    while a later prose mention of the same unit word (with no numbers next
    to it) would otherwise be matched instead. "тонна"/"tonna" don't need a
    leading boundary since they're distinctive enough; the short forms
    (тн/tn/t) keep it to avoid matching inside unrelated words.
    """
    pattern = r"(?:тонна|tonna)\b|\b(?:тн|tn|t)\b"
    for match in re.finditer(pattern, text, re.IGNORECASE):
        window_text = text[match.end():match.end() + window]
        tokens = re.findall(r"\d[\d\s]*[.,]\d+", window_text)
        values = [value for value in (parse_decimal(token) for token in tokens) if value is not None]
        if len(values) >= 2:
            return values
    return []


def parse_items(text: str) -> list[dict]:
    brand = first([r"\b(БНД\s*\d{2,3}/\d{2,3}|BND\s*\d{2,3}/\d{2,3})\b"], text)
    product_name = first([
        r"((?:Йўлбоп|Yo['‘’`]?lbop|йўлбоп|дорожн\w*)[\s\S]{0,90}?(?:битум|Bitum|бітум|БНД|BND))",
        r"((?:битум|Битум|Bitum|bitum)[\s\S]{0,80}?(?:БНД|BND))",
    ], text)
    if product_name and brand and brand not in product_name:
        product_name = f"{product_name} {brand}"
    unit = first([r"\b(тонна|tonna|тн|tn|t)\b"], text)

    # Prefer the table-anchored numbers over prose-adjacency search: a label
    # like "миқдор" or "нархи" can appear, unrelated, elsewhere in the
    # document (a different clause, a duplicate specification table's own
    # header) and amount_after() would confidently grab the wrong nearby
    # number. Anchoring on the unit token instead reads straight from the
    # actual item row, so it wins whenever it finds enough numbers; prose
    # search only fills in whatever it couldn't.
    quantity = unit_price = total_without_vat = vat_amount = total_with_vat = None
    fallback = numbers_after_unit(text)
    if len(fallback) >= 5:
        quantity, unit_price, total_without_vat, vat_amount, total_with_vat = fallback[:5]
    elif len(fallback) >= 3:
        quantity, unit_price, total_with_vat = fallback[:3]
    elif len(fallback) == 2:
        quantity, unit_price = fallback

    quantity = quantity or amount_after([r"(?:миқдор|микдор|количество|quantity)"], text)
    unit_price = unit_price or amount_after([r"(?:бирлик нарх|цена за единицу|unit price|нархи)"], text)
    total_without_vat = total_without_vat or amount_after([r"(?:QQSsiz|НДСсиз|без НДС|жами сумма|стоимость без НДС)"], text)
    vat_rate = parse_decimal(first([r"(?:QQS|НДС)[^\d]{0,10}(\d{1,2}(?:[.,]\d+)?)\s*%"], text))
    vat_amount = vat_amount or amount_after([r"(?:QQS summasi|НДС сумма|сумма НДС)"], text)
    total_with_vat = total_with_vat or amount_after([r"(?:QQS bilan|с НДС|НДС билан|жами тўлов|итого)"], text)
    if not product_name and not any([quantity, unit_price, total_with_vat]):
        return []

    # These contracts state one price, "qo'shilgan qiymat solig'i bilan birga",
    # and usually give no VAT breakdown at all. Split that inclusive total here
    # so the review screen shows the same base and tax that will be stored --
    # otherwise the reviewer sees two empty boxes and has to work it out.
    rate = vat_rate or Decimal("12")
    if total_with_vat and total_without_vat is None and vat_amount is None and rate:
        total_without_vat = (total_with_vat / (Decimal("1") + rate / Decimal("100"))).quantize(Decimal("0.01"))
        vat_amount = total_with_vat - total_without_vat

    return [{
        "product_name": product_name,
        "product_brand": brand,
        "catalog_code": first([r"(?:каталог|catalog)[^\w\d]{0,20}([A-ZА-ЯЁЎҚҒҲ0-9\-/.]+)"], text),
        "barcode": first([r"(?:штрих код|barcode)[^\d]{0,20}(\d{8,20})"], text),
        "unit": unit or "tonna",
        "quantity": quantity,
        "unit_price": unit_price,
        "amount_without_vat": total_without_vat,
        "vat_rate": rate,
        "vat_amount": vat_amount,
        "amount_with_vat": total_with_vat,
    }]


def count_specification_rows(text: str) -> int:
    """Best-effort count of item rows in an explicit specification table/annex.

    parse_items() only ever returns a single item, so contracts with a genuine
    multi-row specification silently lose every row after the first. This is
    scoped to an actual "SPECIFICATION" section heading (not just any mention
    of the word in prose) so it doesn't misfire on single-item contracts.
    """
    match = re.search(r"(?m)^\s*\d{1,3}\.\s*(?:СПЕЦИФИКАЦИЯ|SPETSIFIKATSIYA)\s*$", text)
    if not match:
        return 0
    tail = text[match.end():]
    end_match = re.search(r"(?i)(Юридические адреса|Yuridik manzil|РЕКВИЗИТЫ)", tail)
    section = tail[:end_match.start() if end_match else 3000]
    return len(re.findall(r"(?m)^\s*(\d{1,2})\s+\D", section))


def calculation_warnings(result: ParsedContractResult) -> list[str]:
    warnings: list[str] = []
    tolerance = Decimal("1.00")
    for item in result.items:
        q = item.get("quantity")
        p = item.get("unit_price")
        subtotal = item.get("amount_without_vat")
        vat_rate = item.get("vat_rate")
        vat = item.get("vat_amount")
        total = item.get("amount_with_vat")
        mismatch = False
        # quantity x unit price has to land on one of the two totals: the base
        # when the price excludes VAT, the inclusive total when it carries it.
        # Measuring against the base alone flags every VAT-inclusive contract,
        # which is most of them here.
        if q is not None and p is not None:
            line_total = q * p
            candidates = [c for c in (subtotal, total) if c is not None]
            if candidates and all(abs(line_total - c) > tolerance for c in candidates):
                mismatch = True
        if subtotal is not None and vat_rate is not None and vat is not None and abs((subtotal * vat_rate / 100) - vat) > tolerance:
            mismatch = True
        if subtotal is not None and vat is not None and total is not None and abs((subtotal + vat) - total) > tolerance:
            mismatch = True
        if mismatch:
            warnings.append("Hisob-kitob qiymatlarida farq aniqlandi. Ma’lumotlarni tekshiring.")
            break
    return warnings


def parse_contract_text(text: str) -> ParsedContractResult:
    normalized = normalize_text(text)
    result = ParsedContractResult(raw_text=normalized)
    dates = re.findall(r"\b\d{2}\.\d{2}\.\d{4}\b", normalized)
    result.contract_number = first([
        r"(?:Договор|Шартнома|SHARTNOMA)\s*№\s*([A-ZА-ЯЁЎҚҒҲ0-9\-\/]+)",
        r"№\s*([A-ZА-ЯЁЎҚҒҲ0-9\-\/]+)\s*(?:сонли|договор)",
    ], normalized)
    result.contract_date = parse_date(dates[0]) if dates else None
    result.valid_until = (
        date_near_keyword(normalized, ["действителен до", "amal qilish muddati", "amal qiladi"])
        or parse_uzbek_prose_date(normalized)
        or (parse_date(dates[-1]) if len(dates) > 1 else None)
    )
    result.place = first([r"\b(Тошкент\s*ш\.?|Toshkent\s*sh\.?|[A-ZА-ЯЁЎҚҒҲ][^\n]{2,40}\s*ш\.?)\s+\d{2}\.\d{2}\.\d{4}"], normalized)

    requisites_scope = find_requisites_block(normalized) or normalized
    executor_section = extract_section(requisites_scope, [r"(?:Бажарувчи|Исполнитель|Поставщик|Yetkazib beruvchi)"], [r"(?:Буюртмачи|Заказчик|Покупатель|Buyurtmachi)"])
    customer_section = extract_section(requisites_scope, [r"(?:Буюртмачи|Заказчик|Покупатель|Buyurtmachi)"], [r"(?:Бажарувчи|Исполнитель|Поставщик|Yetkazib beruvchi|Спецификация|Илова|Приложение)"])
    paired = parse_paired_labeled_requisites(requisites_scope)
    if paired:
        result.executor, result.customer = paired
    else:
        result.executor = parse_requisites(executor_section or requisites_scope[:2500])
        result.customer = parse_requisites(customer_section or requisites_scope[-3000:])
    if result.executor.get("name") and result.customer.get("name") == result.executor.get("name"):
        result.customer["name"] = None

    result.items = parse_items(normalized)
    item = result.items[0] if result.items else {}
    result.totals = {
        "total_without_vat": item.get("amount_without_vat") or amount_after([r"(?:QQSsiz umumiy|без НДС|жами сумма)"], normalized),
        "vat_rate": item.get("vat_rate") or parse_decimal(first([r"(?:QQS|НДС)[^\d]{0,10}(\d{1,2}(?:[.,]\d+)?)\s*%"], normalized)),
        "vat_amount": item.get("vat_amount") or amount_after([r"(?:QQS summasi|сумма НДС|НДС сумма)"], normalized),
        "total_with_vat": item.get("amount_with_vat") or amount_after([r"(?:QQS bilan umumiy|с НДС|итого к оплате|жами тўлов)"], normalized),
    }
    result.payment_terms = {
        "prepayment_percent": parse_decimal(first([r"(?:oldindan|аванс|предоплат)[^\d]{0,40}(\d{1,3}(?:[.,]\d+)?)\s*%"], normalized)),
        "prepayment_amount": amount_after([r"(?:аванс|oldindan|предоплат)"], normalized),
        "remaining_payment_percent": None,
        "payment_terms_text": first([r"((?:аванс|oldindan|предоплат)[^\n]{10,300})"], normalized),
    }
    if result.payment_terms["prepayment_percent"] is not None:
        result.payment_terms["remaining_payment_percent"] = Decimal("100") - result.payment_terms["prepayment_percent"]
    result.transport_cost_separate = bool(re.search(r"(transport|транспорт)[^\n]{0,120}(alohida|отдельно|не включ)", normalized, re.IGNORECASE))
    result.document_ids = {
        "didox_id": first([r"ID\s+документа\s*\(Didox\.uz\)\s*[:\-]?\s*([A-ZА-ЯЁЎҚҒҲ0-9\-_/]+)", r"Didox[^\n:]*[:\-]?\s*([A-ZА-ЯЁЎҚҒҲ0-9\-_/]+)"], normalized),
        "rouming_id": first([r"ID\s+документа\s*\(Rouming\.uz\)\s*[:\-]?\s*([A-ZА-ЯЁЎҚҒҲ0-9\-_/]+)", r"Rouming[^\n:]*[:\-]?\s*([A-ZА-ЯЁЎҚҒҲ0-9\-_/]+)"], normalized),
    }

    # Debris is dropped rather than stored: an operator can fill an empty field,
    # but has no way of telling that "//my" is not a document id.
    for party in (result.customer, result.executor):
        cleaned, warning = contract_parse_checks.clean_party_name(party.get("name"))
        if cleaned is not None or party.get("name"):
            party["name"] = cleaned
        if warning:
            result.warnings.append(warning)
    for key in ("didox_id", "rouming_id"):
        cleaned, warning = contract_parse_checks.clean_document_id(result.document_ids.get(key))
        result.document_ids[key] = cleaned
        if warning:
            result.warnings.append(warning)
    for parsed_item in result.items:
        for key, label in (("catalog_code", "Katalog kodi"), ("product_code", "Mahsulot kodi")):
            cleaned, warning = contract_parse_checks.clean_catalog_code(parsed_item.get(key), label)
            parsed_item[key] = cleaned
            if warning:
                result.warnings.append(warning)

    # The score counts fields whose value could be true, not fields that came
    # back non-empty -- see contract_parse_checks for why.
    score, field_warnings = contract_parse_checks.confidence_and_warnings(result)
    result.warnings.extend(field_warnings)
    if len(normalized) < 1000:
        result.warnings.append("PDF matni to‘liq o‘qilmagan bo‘lishi mumkin.")
    result.warnings.extend(calculation_warnings(result))
    spec_row_count = count_specification_rows(normalized)
    if spec_row_count > len(result.items):
        result.warnings.append(
            f"Spetsifikatsiyada {spec_row_count} ta mahsulot qatori borga o‘xshaydi, "
            f"lekin faqat {len(result.items)} tasi avtomatik aniqlandi. Qolganlarini qo‘lda kiriting."
        )
    result.confidence = score
    return result


def parse_contract_pdf(file_path: str | Path) -> ParsedContractResult:
    text = extract_pdf_text(file_path)
    if not text.strip():
        raise ValueError("PDF matnini o‘qib bo‘lmadi. Fayl skaner qilingan bo‘lishi mumkin.")
    return parse_contract_text(text)
