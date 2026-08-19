"""Which status a contract may move to, and from where.

The contract card had no status control at all: the only way to change one was
the dropdown on the full edit form, which meant any status could be set from any
other, and nothing recorded who did it or why. For a legal document that is the
wrong shape twice over -- no rules and no trail.

Same approach as the talabnoma flow: the transitions live here, the API
validates against them and reports them to the browser, so the buttons on
screen and the rule on the server cannot drift apart.

    draft -> signed -> active -> completed

An active contract that passes its valid_until becomes `expired` on its own --
the nightly sweep records it like any other change, with a reason. Extending it
is the way back to active.

Anything not yet finished can be cancelled, and a cancelled contract can be
reopened as a draft. Each step also has a way back, because correcting a
mis-click is ordinary work -- but going back is deliberate and has to say why.
"""

from backend.app.models.contract import ContractStatus as S

# Written on the one opening entry each existing contract got when history
# started. Declared here as MSG_* so the Cyrillic dictionary picks it up -- it
# is stored in the database and read back like any other comment.
MSG_EXPIRED_AUTOMATICALLY = "Amal qilish muddati tugadi."
MSG_HISTORY_BASELINE = "Tarix yuritish boshlangunga qadar mavjud holat."


FORWARD: dict[S, tuple[S, ...]] = {
    S.draft: (S.signed,),
    S.signed: (S.active,),
    S.active: (S.completed,),
    S.completed: (),
    # An expired contract can still be closed out -- the goods may have been
    # delivered before the date ran out.
    S.expired: (S.completed,),
    S.cancelled: (),
}

BACKWARD: dict[S, tuple[S, ...]] = {
    S.draft: (),
    S.signed: (S.draft,),
    S.active: (S.signed,),
    # Reopening a completed contract is a real correction, not an oddity: a
    # delivery that turns out to be short puts it back into active.
    S.completed: (S.active,),
    # Putting an expired contract back to active is how an extension is
    # recorded: the reason field says until when and on what basis.
    S.expired: (S.active,),
    S.cancelled: (S.draft,),
}

CANCELLABLE = (S.draft, S.signed, S.active, S.expired)


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
