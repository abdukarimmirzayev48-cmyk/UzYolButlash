"""Xarid qaysi holatdan qaysi holatga o'tishi mumkin.

Enumda o'n ikkita holat bor edi, lekin ularning faqat to'rttasiga yetib borish
mumkin edi: `draft` (yaratilganda), `offers_received` va `supplier_selected`
(takliflar hisoblanganda avtomatik), `supplier_confirmed` (tasdiqlash
tugmasida). Qolgan sakkiztasini hech qanday endpoint qo'ymasdi -- ya'ni
«Xarid tasdiqlandi», «Olib ketishga tayyor», «Yakunlandi» degan holatlar
ro'yxatda turar, lekin ularga o'tish yo'li yo'q edi.

Ta'minotchi tasdiqlangunga qadar holat takliflardan avtomatik hisoblanadi va
qo'lda o'zgartirilmaydi -- aks holda ikkita manba bir maydonni tortishtiradi.
Undan keyingi bosqichlar esa jismoniy ish: xarid tasdiqlandimi, ta'minotchi
tayyorlayaptimi, mol olib ketishga tayyormi. Bularni faqat odam biladi.

Orqaga qaytarish va bekor qilish sabab talab qiladi: sabab izohlar tarixiga
yoziladi, chunki xaridning alohida holat tarixi jadvali yo'q.
"""

from backend.app.models.procurement import ProcurementStatus as S

MSG_AUTO_STAGE = "Bu bosqichda holat takliflardan avtomatik hisoblanadi."
MSG_COMMENT_REQUIRED = "Orqaga qaytarish, muammo va bekor qilish uchun sabab yozish shart."

# Ta'minotchi tasdiqlangunga qadar holatni recalculate_procurement boshqaradi.
AUTO_STATUSES = (S.draft, S.supplier_search, S.offers_received, S.supplier_selected)

FORWARD: dict[S, tuple[S, ...]] = {
    S.supplier_confirmed: (S.purchase_approved,),
    S.purchase_approved: (S.waiting_supplier_ready,),
    S.waiting_supplier_ready: (S.ready_for_pickup,),
    S.ready_for_pickup: (S.ready_for_delivery,),
    S.ready_for_delivery: (S.completed,),
    # Muammo hal bo'lgach, ish tasdiqlangan ta'minotchidan davom etadi.
    S.issue: (S.supplier_confirmed,),
}

BACKWARD: dict[S, tuple[S, ...]] = {
    S.purchase_approved: (S.supplier_confirmed,),
    S.waiting_supplier_ready: (S.purchase_approved,),
    S.ready_for_pickup: (S.waiting_supplier_ready,),
    S.ready_for_delivery: (S.ready_for_pickup,),
    S.completed: (S.ready_for_delivery,),
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
