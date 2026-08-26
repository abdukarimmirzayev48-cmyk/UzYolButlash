from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.app.models.task import TASK_TERMINAL_STATUSES, Notification, Task


def notify(
    db: Session,
    user_id: int,
    title: str,
    body: str | None,
    kind: str,
    task_id: int | None = None,
    link_path: str | None = None,
) -> Notification:
    notification = Notification(user_id=user_id, task_id=task_id, link_path=link_path, title=title, body=body, kind=kind)
    db.add(notification)
    db.commit()
    return notification


def has_notification(db: Session, task_id: int, user_id: int, kind: str) -> bool:
    return (
        db.query(Notification.id)
        .filter(Notification.task_id == task_id, Notification.user_id == user_id, Notification.kind == kind)
        .first()
        is not None
    )


def _notify_once(db: Session, task: Task, user_ids: set[int | None], kind: str, title: str) -> None:
    for user_id in user_ids:
        if user_id is not None and not has_notification(db, task.id, user_id, kind):
            notify(db, user_id, title, None, kind, task.id)


MSG_PAYMENT_OVERDUE = "Shartnoma bo'yicha to'lov muddati o'tdi"


def _has_link_notification(db: Session, user_id: int, kind: str, link_path: str) -> bool:
    """Dedup for notifications about something other than a task.

    has_notification() keys on task_id, which is null here, so it would treat
    every contract alike and send one notice for all of them.
    """
    return (
        db.query(Notification.id)
        .filter(
            Notification.user_id == user_id,
            Notification.kind == kind,
            Notification.link_path == link_path,
        )
        .first()
        is not None
    )


def sweep_overdue_contract_payments(db: Session) -> int:
    """Tell the people who can act about contract money that is past due.

    The payment terms said "advance within 10 days" and nothing ever compared
    that to the calendar, so an advance of 1 428 000 000 so'm sat 196 days late
    with only a mild "not arrived yet" note on the card. Now it reaches whoever
    holds the sotuv rights, once per contract.
    """
    # Imported here: notifications is loaded early by the scheduler, and the
    # contract API pulls in most of the app.
    from datetime import date

    from backend.app.models.contract import Contract, ContractStatus
    from backend.app.models.finance import CustomerInvoice, InvoiceStatus
    from backend.app.models.user import User
    from backend.app.services import contract_payment_schedule

    recipients = [
        user.id
        for user in db.query(User).filter(User.is_active.is_(True)).all()
        if user.is_admin or "sotuv" in (user.edit_modules or [])
    ]
    if not recipients:
        return 0

    sent = 0
    contracts = (
        db.query(Contract)
        .filter(Contract.status.notin_([ContractStatus.completed, ContractStatus.cancelled]))
        .all()
    )
    for contract in contracts:
        terms = contract.payment_terms
        invoices = (
            db.query(CustomerInvoice)
            .filter(
                CustomerInvoice.contract_id == contract.id,
                CustomerInvoice.status != InvoiceStatus.cancelled,
            )
            .all()
        )
        items = contract_payment_schedule.build_schedule(
            contract_date=contract.contract_date,
            advance_due_days=terms.advance_due_days if terms else None,
            advance_amount=terms.advance_amount if terms else 0,
            invoices=[
                {
                    "number": invoice.invoice_number,
                    "type": invoice.invoice_type.value,
                    "due_date": invoice.due_date,
                    "amount": invoice.total_amount,
                    "paid_amount": invoice.paid_amount,
                }
                for invoice in invoices
            ],
            today=date.today(),
        )
        overdue = [item for item in items if item.is_overdue]
        if not overdue:
            continue
        worst = max(overdue, key=lambda item: item.overdue_days)
        link = f"/contracts/{contract.id}"
        body = f"{contract.contract_number}: {worst.label} — {worst.overdue_days} kun"
        for user_id in recipients:
            if _has_link_notification(db, user_id, "contract_payment_overdue", link):
                continue
            notify(db, user_id, MSG_PAYMENT_OVERDUE, body, "contract_payment_overdue", None, link)
            sent += 1
    return sent


MSG_TRANSPORT_DOCUMENT_EXPIRED = "Transport hujjati muddati o'tgan"
MSG_TRANSPORT_DOCUMENT_EXPIRING = "Transport hujjati muddati tugayapti"
MSG_TRANSPORT_SERVICE_DUE = "Transport texnik xizmat muddati keldi"


def sweep_transport_documents(db: Session) -> int:
    """Texko'rik, sug'urta va ADR muddati haqida oldindan xabar berish.

    Muddati o'tgan hujjat bilan mashina yo'lda to'xtatiladi -- yuk bilan
    birga. Ilgari bu muddatlar hech qayerda saqlanmasdi, demak ular haqida
    ogohlantirish ham bo'lishi mumkin emas edi: xabar faqat post tepasida,
    jarima yozilganda kelardi.

    Xabar yetkazib berish huquqi bor xodimlarga boradi va har bir mashina
    uchun bir marta yuboriladi -- shartnoma to'lovlaridagi kabi, havola
    bo'yicha takrorlanmaydi.
    """
    from datetime import date

    from backend.app.models.transport import Transport
    from backend.app.models.user import User
    from backend.app.services import transport_readiness

    recipients = [
        user.id
        for user in db.query(User).filter(User.is_active.is_(True)).all()
        if user.is_admin or "yetkazib_berish" in (user.edit_modules or [])
    ]
    if not recipients:
        return 0

    today = date.today()
    sent = 0
    for transport in db.query(Transport).all():
        readiness = transport_readiness.build_readiness(transport, today=today)
        expired = [row for row in readiness.documents if row.level == transport_readiness.LEVEL_EXPIRED]
        expiring = [row for row in readiness.documents if row.level == transport_readiness.LEVEL_SOON]
        link = f"/transports/{transport.id}"
        # Bitta mashina uchun bitta xabar: eng og'iri aytiladi, qolganini
        # kartochkada ko'radi. Aks holda uchta hujjat uchta xabar bo'lardi.
        if expired:
            title, kind = MSG_TRANSPORT_DOCUMENT_EXPIRED, "transport_document_expired"
            rows = expired
        elif expiring:
            title, kind = MSG_TRANSPORT_DOCUMENT_EXPIRING, "transport_document_expiring"
            rows = expiring
        else:
            continue
        detail = ", ".join(f"{row.label} — {row.until}" for row in rows)
        body = f"{transport.vehicle_number}: {detail}"
        for user_id in recipients:
            if _has_link_notification(db, user_id, kind, link):
                continue
            notify(db, user_id, title, body, kind, None, link)
            sent += 1
    return sent


MSG_CONTRACT_EXPIRED = "Shartnoma muddati tugadi"
MSG_CONTRACT_EXPIRING = "Shartnoma muddati tugayapti"

# How far ahead to warn. A month is enough notice to start an extension.
EXPIRY_WARNING_DAYS = 30


def sweep_expired_contracts(db: Session) -> int:
    """Move contracts past their valid_until to `expired`, and warn about the
    ones about to get there.

    A contract that ran out ten weeks ago was still labelled "Faol", and one of
    them had a delivery booked against it. The status is written through the
    same history table as a manual change, so the card shows when it happened
    and that the system did it.
    """
    from datetime import date, timedelta

    from backend.app.models.contract import Contract, ContractStatus, ContractStatusHistory
    from backend.app.models.user import User
    from backend.app.services.contract_workflow import MSG_EXPIRED_AUTOMATICALLY

    today = date.today()
    changed = 0

    running = (
        db.query(Contract)
        .filter(
            Contract.status.in_([ContractStatus.signed, ContractStatus.active]),
            Contract.valid_until.isnot(None),
            Contract.valid_until < today,
        )
        .all()
    )
    for contract in running:
        db.add(
            ContractStatusHistory(
                contract_id=contract.id,
                old_status=contract.status,
                new_status=ContractStatus.expired,
                # No username: the system did this, and saying so is clearer
                # than attributing it to whoever happened to be signed in.
                changed_by=None,
                comment=MSG_EXPIRED_AUTOMATICALLY,
            )
        )
        contract.status = ContractStatus.expired
        changed += 1
    if running:
        db.commit()

    recipients = [
        user.id
        for user in db.query(User).filter(User.is_active.is_(True)).all()
        if user.is_admin or "sotuv" in (user.edit_modules or [])
    ]
    if not recipients:
        return changed

    soon = (
        db.query(Contract)
        .filter(
            Contract.status.in_([ContractStatus.signed, ContractStatus.active]),
            Contract.valid_until.isnot(None),
            Contract.valid_until >= today,
            Contract.valid_until <= today + timedelta(days=EXPIRY_WARNING_DAYS),
        )
        .all()
    )
    for contract, title, body in [
        (c, MSG_CONTRACT_EXPIRED, f"{c.contract_number}: {c.valid_until}") for c in running
    ] + [
        (c, MSG_CONTRACT_EXPIRING, f"{c.contract_number}: {(c.valid_until - today).days} kun") for c in soon
    ]:
        link = f"/contracts/{contract.id}"
        for user_id in recipients:
            kind = "contract_expired" if title == MSG_CONTRACT_EXPIRED else "contract_expiring"
            if _has_link_notification(db, user_id, kind, link):
                continue
            notify(db, user_id, title, body, kind, None, link)
    return changed


def run_reminder_sweep(db: Session) -> None:
    """Deadline reminders (1 day / 1 hour out) and an overdue sweep for non-terminal tasks.

    Idempotent: dedups against existing Notification rows of the same kind for
    the same task+user, so calling this repeatedly (the real use case, run on
    a schedule) never creates duplicates.
    """
    now = datetime.now()
    tasks = db.query(Task).filter(Task.status.notin_(TASK_TERMINAL_STATUSES)).all()
    for task in tasks:
        assignee_user_ids = {assignee.employee.user_id for assignee in task.assignees if assignee.employee.user_id}
        if task.deadline < now:
            _notify_once(db, task, assignee_user_ids | {task.created_by_user_id}, "overdue", f"Muddati o'tib ketdi: {task.title}")
        elif task.deadline <= now + timedelta(hours=1):
            _notify_once(db, task, assignee_user_ids, "reminder_1h", f"1 soatdan keyin muddati tugaydi: {task.title}")
        elif task.deadline <= now + timedelta(hours=24):
            _notify_once(db, task, assignee_user_ids, "reminder_1d", f"Ertaga muddati tugaydi: {task.title}")
