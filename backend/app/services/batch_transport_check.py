"""Partiya transporti shartnomadagi transport shartlariga mos keladimi.

Shartnomada transport bo'yicha ikkita shart yoziladi va ikkalasi ham bugungacha
faqat qog'ozda qolib kelardi:

* **yetkazib berish usuli** -- avto, temir yo'l yoki aralash. Bu maydon butun
  tizimda hech qanday qarorga ta'sir qilmasdi: shartnomada «temir yo'l» deb
  yozib qo'yib, partiyaga yuk mashinasi biriktirish mumkin edi va hech narsa
  gapirmasdi.
* **transport to'lovi turi** -- narxga kiritilgan, alohida hisob-faktura yoki
  mijoz o'zi to'laydi. Faqat ikkinchisida mijozdan transport uchun pul olish
  mumkin, lekin logistikadagi «mijozga transport narxi» maydoniga har qanday
  holatda ham raqam kiritilaverardi.

Bu yerda ikkalasi ham tekshiriladi. Hech narsa bloklanmaydi: shartnomadan
chetga chiqish tijorat qarori bo'lishi mumkin -- masalan temir yo'l band bo'lsa,
yukni mashinada jo'natish. Ammo bu qaror ekranda ko'rinib turishi kerak.
"""

from dataclasses import dataclass

DELIVERY_AUTO = "auto"
DELIVERY_RAILWAY = "railway"
DELIVERY_MIXED = "mixed"

TRANSPORT_INCLUDED = "included"
TRANSPORT_SEPARATE = "separate_invoice"
TRANSPORT_CUSTOMER_PAYS = "customer_pays_directly"

MSG_METHOD_MISMATCH = "Shartnomada yetkazib berish usuli «temir yo'l», partiyaga esa avtotransport biriktirilgan"
MSG_PRICE_INCLUDED = "Shartnomada transport mahsulot narxiga kiritilgan, lekin mijozga transport narxi qo'yilgan"
MSG_PRICE_CUSTOMER_PAYS = "Shartnoma bo'yicha transportni mijoz o'zi to'laydi, lekin mijozga transport narxi qo'yilgan"

TRANSPORT_PRICE_WARNINGS = {
    TRANSPORT_INCLUDED: MSG_PRICE_INCLUDED,
    TRANSPORT_CUSTOMER_PAYS: MSG_PRICE_CUSTOMER_PAYS,
}


def money_text(value) -> str:
    """Valyuta so'zisiz: ogohlantirishning qiymat qismi tarjima qilinmaydi."""
    return f"{value:,.0f}".replace(",", " ")


@dataclass
class TransportCheck:
    delivery_method: str | None = None
    transport_payment_type: str | None = None
    has_road_transport: bool = False
    customer_price: float = 0.0
    warnings: list[str] | None = None


def check_transport(
    *,
    delivery_method: str | None,
    transport_payment_type: str | None,
    has_road_transport: bool,
    customer_price,
) -> TransportCheck:
    """`has_road_transport` -- partiyaga transport raqami, haydovchi yoki
    tashuvchi biriktirilganmi. Logistika modulida temir yo'l yo'q, shuning
    uchun biriktirilgan har qanday transport avtotransport hisoblanadi."""
    warnings: list[str] = []
    price = float(customer_price or 0)

    # Aralash usulda ikkalasi ham ruxsat etilgan, shuning uchun jim turadi.
    if delivery_method == DELIVERY_RAILWAY and has_road_transport:
        warnings.append(MSG_METHOD_MISMATCH)

    if price > 0 and transport_payment_type in TRANSPORT_PRICE_WARNINGS:
        warnings.append(f"{TRANSPORT_PRICE_WARNINGS[transport_payment_type]}: {money_text(price)}")

    return TransportCheck(
        delivery_method=delivery_method,
        transport_payment_type=transport_payment_type,
        has_road_transport=has_road_transport,
        customer_price=price,
        warnings=warnings,
    )
