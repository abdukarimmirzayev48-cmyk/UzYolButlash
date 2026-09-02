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


# ---- Usul va manzil turi o'rtasidagi bog'lanish ---------------------------
#
# Bu bog'lanishning butun mohiyati shu: tuz vagonda keladi, ya'ni uni
# stansiyaga yetkazish mumkin, ABZ ga emas. Bitum bitumovozda ketadi, ya'ni
# ABZ ga boradi, stansiyaga emas. Ro'yxat filtrlanmasa, operator tuz
# partiyasiga ABZ tanlab qo'yadi va xato faqat vagon jo'natilgandan keyin
# bilinadi.
#
# Qoida shu yerda, chunki uni brauzer ham (ro'yxatni filtrlash uchun), server
# ham (mos kelmasa ogohlantirish uchun) ishlatadi.

from backend.app.models.delivery_point import DeliveryPointType

ROAD_POINT_TYPES = (
    DeliveryPointType.abz,
    DeliveryPointType.warehouse,
    DeliveryPointType.object_site,
    DeliveryPointType.other,
)
RAIL_POINT_TYPES = (DeliveryPointType.railway_station,)

MSG_POINT_NOT_RAIL = "Yetkazish usuli temiryo'l, lekin tanlangan nuqta stansiya emas."
MSG_POINT_NOT_ROAD = "Yetkazish usuli avtotransport, lekin tanlangan nuqta temiryo'l stansiyasi."


def point_types_for(method: DeliveryMethod | str | None) -> tuple[DeliveryPointType, ...]:
    """Shu usulda yetkazish mumkin bo'lgan manzil turlari.

    «Aralash» partiyada ikkala tur ham mumkin: unda bitum ham, tuz ham bor.
    """
    value = getattr(method, "value", method)
    if value == DeliveryMethod.railway.value:
        return RAIL_POINT_TYPES
    if value == DeliveryMethod.auto.value:
        return ROAD_POINT_TYPES
    return ROAD_POINT_TYPES + RAIL_POINT_TYPES


def point_warning(method, point) -> str | None:
    """Tanlangan nuqta usulga mos keladimi. Mos kelmasa -- ogohlantirish.

    Bloklamaydi: hujjat allaqachon boshqacha rasmiylashtirilgan bo'lishi
    mumkin, va tizim ishni to'xtatib qo'ymasligi kerak. Lekin jim ham
    turmaydi.
    """
    if point is None or method is None:
        return None
    allowed = point_types_for(method)
    if point.point_type in allowed:
        return None
    return MSG_POINT_NOT_RAIL if DeliveryPointType.railway_station in allowed else MSG_POINT_NOT_ROAD
