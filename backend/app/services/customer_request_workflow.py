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

    new -> reviewing -> negotiation -> contract_preparation
        -> contract_signed -> converted_to_order

Any open state can be rejected, and a rejected talabnoma can be reopened.
Each step also has a way back to the one before it, because correcting a
mis-click is ordinary work -- but going back is a deliberate act, so it is
labelled as such and has to carry a reason.
"""

from backend.app.models.customer_request import CustomerRequestStatus as S

# Moves that advance the request. Order matters only for display.
FORWARD: dict[S, tuple[S, ...]] = {
    S.new: (S.reviewing,),
    S.reviewing: (S.negotiation,),
    S.negotiation: (S.contract_preparation,),
    S.contract_preparation: (S.contract_signed,),
    S.contract_signed: (S.converted_to_order,),
    S.converted_to_order: (),
    S.rejected: (),
}

# Moves that undo a step. Allowed, but never silently: the API demands a
# comment so the history says why.
BACKWARD: dict[S, tuple[S, ...]] = {
    S.new: (),
    S.reviewing: (S.new,),
    S.negotiation: (S.reviewing,),
    S.contract_preparation: (S.negotiation,),
    S.contract_signed: (S.contract_preparation,),
    # Once an order exists the talabnoma is done; unwinding that means dealing
    # with the order, not the talabnoma.
    S.converted_to_order: (),
    S.rejected: (S.new,),
}

# Anything still open can be rejected. Rejection always needs a reason, which
# the endpoint enforces separately.
REJECTABLE = (S.new, S.reviewing, S.negotiation, S.contract_preparation, S.contract_signed)

# converted_to_order is reached through the convert endpoint, which creates the
# order. Allowing it here as well would let the status be set without one.
STATUS_ENDPOINT_EXCLUDED = (S.converted_to_order,)


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
        moves.append({"status": target.value, "direction": "forward", "requires_comment": False})
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
