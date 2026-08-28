"""Talabnoma maydonlarini mijoz kartochkasidan to'ldirish.

Korxona nomi talabnomada erkin matn edi: bir mijoz uch xil yozilishi
mumkin va uning talabnomalarini bir joyga yig'ib bo'lmasdi. Endi korxona
mijozlar ro'yxatidan tanlanadi, qolgan maydonlar esa uning kartochkasidan
olinadi -- ya'ni ular ikkinchi marta qo'lda yozilmaydi va vaqt o'tib
kartochkadan farq qilib qolmaydi.

To'ldirish serverda bajariladi, brauzerda emas: saqlashda ham aynan shu
qiymatlar yoziladi, ya'ni ekranda ko'rgan narsangiz bilan bazaga tushgan
narsa bir xil bo'ladi.

Direktor, faoliyat turi va loyiha nomi mijoz kartochkasida yo'q -- ular
tashkilotlar reyestrida bor. Shuning uchun mijozning STIRi bo'yicha
reyestrdan ham qidiriladi: ma'lumot bor ekan, uni qo'lda qayta yozish
shart emas.
"""

from dataclasses import dataclass, field

MSG_CLIENT_NOT_FOUND = "Tanlangan mijoz topilmadi."


def primary_of(items: list, attribute: str = "is_primary"):
    """Birlamchi yozuv; belgilanmagan bo'lsa -- birinchisi.

    Mijozda bir nechta manzil yoki hisob raqami bo'lishi mumkin va ularning
    birortasi «birlamchi» deb belgilanmagan bo'lishi ham mumkin. Bunday
    holatda bo'sh qoldirish o'rniga birinchisi olinadi: to'g'rilash oson,
    yo'qligini sezish esa qiyin.
    """
    if not items:
        return None
    for item in items:
        if getattr(item, attribute, False):
            return item
    return items[0]


def legal_address_of(client):
    """Yuridik manzil bo'lsa o'sha, bo'lmasa birlamchisi."""
    addresses = list(client.addresses or [])
    legal = [address for address in addresses if getattr(address.address_type, "value", address.address_type) == "legal"]
    address = primary_of(legal) or primary_of(addresses)
    if not address:
        return None, None
    parts = [address.region, address.district, address.address]
    return address.region, ", ".join(part for part in parts if part) or None


@dataclass
class RequestPrefill:
    client_id: int | None = None
    company_name: str | None = None
    inn: str | None = None
    region: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    activity_type: str | None = None
    function_description: str | None = None
    privatization_project_name: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    phone: str | None = None
    contact_full_name: str | None = None
    contact_phone: str | None = None
    warnings: list[str] = field(default_factory=list)


MSG_NO_BANK = "Mijozda bank rekvizitlari kiritilmagan"
MSG_NO_ADDRESS = "Mijozda manzil kiritilmagan"
MSG_NO_CONTACT = "Mijozda kontakt shaxs kiritilmagan"
MSG_NO_REGISTRY = "Tashkilotlar reyestrida bu STIR topilmadi"


def build_prefill(client, registry=None) -> RequestPrefill:
    """`client` -- Client, `registry` -- CompanyRegistry yoki None."""
    prefill = RequestPrefill(client_id=client.id, company_name=client.name, inn=client.inn)
    prefill.oked = client.oked
    prefill.phone = client.phone

    region, legal_address = legal_address_of(client)
    prefill.region = region
    prefill.legal_address = legal_address
    if not legal_address:
        prefill.warnings.append(MSG_NO_ADDRESS)

    bank = primary_of(list(client.bank_accounts or []))
    if bank:
        prefill.bank_name = bank.bank_name
        prefill.mfo = bank.mfo
        prefill.bank_account = bank.account_number
    else:
        prefill.warnings.append(MSG_NO_BANK)

    contact = primary_of(list(client.contacts or []))
    if contact:
        prefill.contact_full_name = contact.full_name
        prefill.contact_phone = contact.phone or client.phone
    else:
        prefill.warnings.append(MSG_NO_CONTACT)

    # Reyestrdagi ma'lumot faqat bo'sh maydonlarni to'ldiradi: mijoz
    # kartochkasi bizniki va u ustun turadi.
    if registry:
        prefill.director_full_name = registry.director_full_name
        prefill.activity_type = registry.activity_type
        prefill.function_description = registry.function_description
        prefill.privatization_project_name = registry.privatization_project_name
        prefill.region = prefill.region or registry.region
        prefill.legal_address = prefill.legal_address or registry.legal_address
        prefill.oked = prefill.oked or registry.oked
        prefill.bank_name = prefill.bank_name or registry.bank_name
        prefill.mfo = prefill.mfo or registry.mfo
        prefill.bank_account = prefill.bank_account or registry.bank_account
        prefill.phone = prefill.phone or registry.phone
    elif client.inn:
        prefill.warnings.append(MSG_NO_REGISTRY)
    return prefill
