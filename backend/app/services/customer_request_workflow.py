"""Which status a talabnoma may move to, and from where.

The status buttons used to be a fixed list of five, rendered the same whatever
state the request was in. A brand-new talabnoma therefore offered "Shartnoma
imzolandi" as a single click, skipping review, negotiation and contract
preparation entirely -- and the server accepted it, because it only checked
that the target was one of the five, never that the move made sense from where
the request actually stood. There was also no way back: a status clicked by
mistake was permanent.

This module is the single description of the flow. The API validates against
it and also reports it to the browser, so the buttons on screen and the rule on
the server can never disagree -- a mismatch there is exactly how a UI ends up
offering something the API then refuses.

The flow:

    new -> reviewing -> contract_preparation -> contract_signed

Har bir oldinga qadam ikki narsani talab qiladi: **hujjat va izoh**.
Hujjat -- qadamning asosi, izoh -- nima uchun qilingani. Ikkalasisiz
tarix «kim, qachon» dan nariga o'tmasdi: bosqich o'zgargani ko'rinardi,
lekin qanday asosda bo'lgani yo'q edi.

Tartib hayotdagi tartib bilan bir xil:

1. Talabnoma ma'lumotlari kiritiladi -- «Yangi».
2. Tashkilotning rasmiy **xati** biriktiriladi -- shundan keyingina
   talabnoma «Ko'rib chiqilmoqda» ga o'tadi. Sotuv bo'limining ishi shu
   yerda tugaydi: keyingi qadam shartnoma bo'limida.
3. Mas'ul xodim shartnoma namunasini tayyorlab, Didox orqali tashkilotga
   yuboradi va o'sha **namunani** biriktiradi -- talabnoma «Shartnoma
   tayyorlanmoqda» ga o'tadi.
4. Shartnoma imzolangach, **imzolangan nusxa** biriktiriladi va
   talabnoma «Shartnoma imzolandi» da yopiladi.

To'rtinchi qadam ikki yo'l bilan qo'yiladi: xodim qo'lda, yoki
talabnomaga bog'langan shartnoma imzolanganda tizim o'zi. Ikkinchisi
muhim -- aks holda bitta voqea ikki joyda alohida yuritilar va ular
bir-biridan ajralib qolardi: shartnoma imzolangan bo'lsa ham, talabnoma
«tayyorlanmoqda» da qotib qolardi.

Ilgari bu ikkisi teskari edi: ko'rib chiqishga o'tish uchun shartnoma
namunasi, shartnoma tayyorlashga o'tish uchun esa xat so'ralardi. Ya'ni
tizim hali kelmagan xatdan oldin namunani talab qilardi, holbuki namuna
aynan xat asosida tayyorlanadi. Ishlab chiqarishda buning izi ko'rinib
turardi: to'rtta talabnoma «shartnoma tayyorlanmoqda» da faqat xat bilan
turardi, bittasi esa namunasi bor holda «yangi» da qolib ketgan edi.

«Muzokara» alohida holat edi. Amalda ko'rib chiqish va muzokara bir vaqtda
ketadi -- operator qaysi biridaligini ajrata olmasdi va tugma tasodifan
bosilardi, tarix esa ma'nosini yo'qotardi. Ikkalasi bitta holatga
birlashtirildi.

Any open state can be rejected, and a rejected talabnoma can be reopened.
Each step also has a way back to the one before it, because correcting a
mis-click is ordinary work -- but going back is a deliberate act, so it is
labelled as such and has to carry a reason.
"""

from backend.app.models.customer_request import CustomerRequestDocumentType as D
from backend.app.models.customer_request import CustomerRequestStatus as S

# Moves that advance the request. Order matters only for display.
FORWARD: dict[S, tuple[S, ...]] = {
    S.new: (S.reviewing,),
    S.reviewing: (S.contract_preparation,),
    S.contract_preparation: (S.contract_signed,),
    S.contract_signed: (),
    S.rejected: (),
}

# Moves that undo a step. Allowed, but never silently: the API demands a
# comment so the history says why.
BACKWARD: dict[S, tuple[S, ...]] = {
    S.new: (),
    S.reviewing: (S.new,),
    S.contract_preparation: (S.reviewing,),
    S.contract_signed: (S.contract_preparation,),
    S.rejected: (S.new,),
}

# Anything still open can be rejected. Rejection always needs a reason, which
# the endpoint enforces separately.
REJECTABLE = (S.new, S.reviewing, S.contract_preparation)

# Endpoint orqali qo'yib bo'lmaydigan holatlar. Hozir bunday holat yo'q.
STATUS_ENDPOINT_EXCLUDED: tuple[S, ...] = ()


def transitions_from(current: S) -> list[dict]:
    """Every move allowed from `current`, tagged with why it is offered.

    The browser renders one button per entry, so a status that offers nothing
    (converted_to_order) correctly shows no buttons at all.
    """
    moves: list[dict] = []
    for target in FORWARD.get(current, ()):
        # converted_to_order is reached by the convert action, which also
        # creates the order. Offering it as a status button would put a control
        # on screen that the status endpoint then refuses -- the page reports
        # it through `can_convert_to_order` instead.
        if target in STATUS_ENDPOINT_EXCLUDED:
            continue
        # Oldinga qadam ham izoh so'raydi: hujjat nima biriktirilganini
        # aytadi, izoh esa nima uchun shu qadam qo'yilganini.
        moves.append({"status": target.value, "direction": "forward", "requires_comment": True})
    for target in BACKWARD.get(current, ()):
        moves.append({"status": target.value, "direction": "backward", "requires_comment": True})
    if current in REJECTABLE:
        moves.append({"status": S.rejected.value, "direction": "reject", "requires_comment": True})
    return moves


def allowed_targets(current: S) -> set[S]:
    return {S(move["status"]) for move in transitions_from(current)}


def transition_kind(current: S, target: S) -> str | None:
    for move in transitions_from(current):
        if move["status"] == target.value:
            return move["direction"]
    return None


# Har bir oldinga qadam o'z hujjatini talab qiladi. Qoida shu yerda,
# chunki brauzer tugmani shu asosda o'chiradi va server ham shu asosda rad
# etadi -- ikkisi hech qachon ajralib qolmaydi.
REQUIRED_DOCUMENT: dict[S, D] = {
    S.reviewing: D.letter,
    S.contract_preparation: D.contract_sample,
    S.contract_signed: D.signed_contract,
}

# Alohida konstanta: lug'at generatori aynan modul darajasidagi `MSG_*`
# nomlarni oladi, lug'at ichidagi matnni emas.
MSG_LETTER_REQUIRED = "Ko'rib chiqishga o'tish uchun tashkilotning rasmiy xati biriktirilishi shart."
MSG_SAMPLE_REQUIRED = "Shartnoma tayyorlashga o'tish uchun Didox orqali yuborilgan shartnoma namunasi biriktirilishi shart."
MSG_SIGNED_REQUIRED = "Talabnomani yopish uchun imzolangan shartnoma nusxasi biriktirilishi shart."
MSG_FORWARD_COMMENT = "Bosqichni o'zgartirish uchun izoh yozing."
# Shartnoma imzolanganda talabnoma o'zi yopiladi -- tarixda shu yozuv
# qoladi, ya'ni holat o'zidan-o'zi o'zgargandek ko'rinmaydi.
MSG_SIGNED_FROM_CONTRACT = "Bog'langan shartnoma imzolandi."

MSG_DOCUMENT_REQUIRED = {
    D.letter: MSG_LETTER_REQUIRED,
    D.contract_sample: MSG_SAMPLE_REQUIRED,
    D.signed_contract: MSG_SIGNED_REQUIRED,
}


def required_document(target: S) -> D | None:
    return REQUIRED_DOCUMENT.get(target)
