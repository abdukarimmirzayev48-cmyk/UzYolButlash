"""Ta'mir arizasi qaysi holatdan qaysi holatga o'tishi mumkin.

Xarid oqimidagi kabi: qoidalar shu yerda, API ular bo'yicha tekshiradi va
sahifa ayni shu qoidalardan tugma chizadi. Shunda ekrandagi tugma bilan
serverdagi qoida bir-biridan uzilib qololmaydi.

    yangi -> diagnostika -> ehtiyot qism kutilmoqda -> ta'mirda -> tayyor -> yopildi

Har bir qadamdan orqaga qaytish bor, chunki noto'g'ri bosilgan tugmani
to'g'rilash oddiy ish. Lekin orqaga qaytish va bekor qilish sabab talab
qiladi: sabab izohga yoziladi.

Diagnostikadan to'g'ridan-to'g'ri ta'mirga ham o'tish mumkin -- ehtiyot qism
kutish har doim ham kerak emas.
"""

from backend.app.models.transport import RepairStatus as S

MSG_COMMENT_REQUIRED = "Orqaga qaytarish va bekor qilish uchun sabab yozish shart."
MSG_BAD_TRANSITION = "Bu holatdan bunday o'tish mumkin emas"
MSG_STATUS_CHANGED = "Holat o'zgartirildi"
MSG_RESULT_REQUIRED = "Yopishdan oldin natija yozilishi kerak."

FORWARD: dict[S, tuple[S, ...]] = {
    S.new: (S.diagnosis,),
    S.diagnosis: (S.waiting_parts, S.in_repair),
    S.waiting_parts: (S.in_repair,),
    S.in_repair: (S.done,),
    S.done: (S.closed,),
    S.closed: (),
    S.cancelled: (),
}

BACKWARD: dict[S, tuple[S, ...]] = {
    S.new: (),
    S.diagnosis: (S.new,),
    S.waiting_parts: (S.diagnosis,),
    S.in_repair: (S.diagnosis,),
    S.done: (S.in_repair,),
    # Yopilgan ariza qayta ochilishi mumkin: nosozlik takrorlansa, bu
    # o'sha ishning davomi, yangi ariza emas.
    S.closed: (S.in_repair,),
    S.cancelled: (S.new,),
}

CANCELLABLE = (S.new, S.diagnosis, S.waiting_parts, S.in_repair)


def transitions_from(current: S) -> list[dict]:
    moves: list[dict] = []
    for target in FORWARD.get(current, ()):
        moves.append({"status": target.value, "direction": "forward", "requires_comment": False})
    for target in BACKWARD.get(current, ()):
        moves.append({"status": target.value, "direction": "backward", "requires_comment": True})
    if current in CANCELLABLE:
        moves.append({"status": S.cancelled.value, "direction": "cancel", "requires_comment": True})
    return moves


def transition_kind(current: S, target: S) -> str | None:
    for move in transitions_from(current):
        if move["status"] == target.value:
            return move["direction"]
    return None
