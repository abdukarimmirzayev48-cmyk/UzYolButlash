"""Xarid qaysi holatdan qaysi holatga o'tishi mumkin.

Xarid endi har buyurtmaga avtomatik ochilmaydi: mol birja ticketidan zaxiraga
tushadi va buyurtma o'sha yerdan bajariladi. Xarid faqat birjadan olinmagan mol
uchun -- ta'minotchi qidirilganda -- qo'lda yaratiladi.

Shuning uchun bosqichlar ham qisqardi. Ilgari enumda o'n ikkita holat bor edi,
lekin amalda faqat ikkitasiga yetib borilgan: `draft` va `supplier_selected`.
«Xarid tasdiqlandi», «Olib ketishga tayyor», «Yetkazishga tayyor» degan
bosqichlar ro'yxatda turar, hech kim ularni qo'ymasdi -- mol harakati
Partiyalar bo'limida kuzatiladi, bu yerda takrorlashning hojati yo'q.

Qolgan yo'l: qoralama -> ta'minotchi tanlandi -> ta'minotchi tasdiqlandi ->
yakunlandi. Ta'minotchi tanlangunga qadar holat takliflardan avtomatik
hisoblanadi va qo'lda o'zgartirilmaydi -- aks holda ikkita manba bir maydonni
tortishtiradi.

Orqaga qaytarish va bekor qilish sabab talab qiladi: sabab izohlar tarixiga
yoziladi, chunki xaridning alohida holat tarixi jadvali yo'q.
"""

from backend.app.models.procurement import ProcurementStatus as S

MSG_AUTO_STAGE = "Bu bosqichda holat takliflardan avtomatik hisoblanadi."
MSG_COMMENT_REQUIRED = "Orqaga qaytarish, muammo va bekor qilish uchun sabab yozish shart."

# Ta'minotchi tanlangunga qadar holatni recalculate_procurement boshqaradi.
AUTO_STATUSES = (S.draft, S.supplier_selected)

FORWARD: dict[S, tuple[S, ...]] = {
    # Taklif kiritilsa holat o'zi ko'chadi, lekin rasmiy taklifsiz ham
    # ta'minotchi topiladi -- qo'lda oldinga surish yo'li ochiq turadi.
    S.draft: (S.supplier_selected,),
    S.supplier_selected: (S.supplier_confirmed,),
    S.supplier_confirmed: (S.completed,),
    # Muammo hal bo'lgach, ish tanlangan ta'minotchidan davom etadi.
    S.issue: (S.supplier_selected,),
}

BACKWARD: dict[S, tuple[S, ...]] = {
    S.supplier_selected: (S.draft,),
    S.supplier_confirmed: (S.supplier_selected,),
    S.completed: (S.supplier_confirmed,),
}

# Muammo va bekor qilish -- yakunlangan va bekor qilingandan tashqari hamma
# joydan.
CLOSED = (S.completed, S.cancelled)


def transitions_from(current: S) -> list[dict]:
    moves: list[dict] = []
    for target in FORWARD.get(current, ()):
        moves.append({"status": target.value, "direction": "forward", "requires_comment": False})
    for target in BACKWARD.get(current, ()):
        moves.append({"status": target.value, "direction": "backward", "requires_comment": True})
    if current not in CLOSED and current is not S.issue:
        moves.append({"status": S.issue.value, "direction": "issue", "requires_comment": True})
    if current not in CLOSED:
        moves.append({"status": S.cancelled.value, "direction": "cancel", "requires_comment": True})
    return moves


def transition_kind(current: S, target: S) -> str | None:
    for move in transitions_from(current):
        if move["status"] == target.value:
            return move["direction"]
    return None
