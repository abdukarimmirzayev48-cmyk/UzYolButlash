"""Partiya qanday yetkaziladi -- sukut bo'yicha qiymatni topish.

Yetkazish usuli partiyaning xossasi, mahsulotning emas: bugun bitum
texnikada, texnik tuz temiryo'lda ketadi, lekin katta bitum partiyasi
temiryo'l sisternasida yoki bir mashina tuz to'g'ridan-to'g'ri ketishi
ham mumkin. Shuning uchun mahsulot turkumi faqat SUKUT qiymatni beradi,
operator uni almashtira oladi.

Bitta partiyada har xil usulli mahsulotlar bo'lsa, javob «aralash»:
bu holatni jimgina bittasiga yaxlitlash hujjatda xato bo'lib qolardi.
"""

from backend.app.models.contract import DeliveryMethod

DEFAULT_METHOD = DeliveryMethod.auto


def default_method_for(categories) -> DeliveryMethod:
    """Turkumlarning sukut usullaridan partiyaning usulini chiqaradi.

    `categories` -- partiyadagi mahsulotlarning turkumlari (takrorlanishi
    mumkin, None ham bo'lishi mumkin).
    """
    chosen = {
        category.default_delivery_method
        for category in categories
        if category is not None and category.default_delivery_method is not None
    }
    if not chosen:
        # Hech qaysi turkumda ko'rsatilmagan: bugungi kunda hamma narsa
        # avtotransportda ketadi, shundan boshlaymiz.
        return DEFAULT_METHOD
    if len(chosen) == 1:
        return chosen.pop()
    return DeliveryMethod.mixed
