from datetime import date
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, nullslast, or_, select, true
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import (
    AddressType,
    Client,
    ClientAddress,
    ClientBankAccount,
    ClientContact,
    ClientDocument,
    ClientNote,
)
from backend.app.models.contract import Contract
from backend.app.models.delivery import DeliveryBatch
from backend.app.models.finance import CustomerInvoice, CustomerPayment
from backend.app.models.order import Order
from backend.app.services import client_export
from backend.app.schemas.client import (
    ClientAddressCreate,
    ClientAddressRead,
    ClientAddressUpdate,
    ClientBankAccountCreate,
    ClientBankAccountRead,
    ClientBankAccountUpdate,
    ClientBulkDelete,
    ClientContactCreate,
    ClientContactRead,
    ClientContactUpdate,
    ClientCreate,
    ClientDetail,
    ClientDocumentCreate,
    ClientDocumentRead,
    ClientDocumentUpdate,
    ClientListItem,
    ClientNoteCreate,
    ClientNoteRead,
    ClientNoteUpdate,
    ClientRead,
    ClientUpdate,
    Page,
)
from backend.app.services.auth import require_edit


router = APIRouter(prefix="/api/clients", tags=["clients"])


def get_client_or_404(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mijoz topilmadi.")
    return client


def get_child_or_404(db: Session, model: Any, client_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.client_id != client_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Element topilmadi.")
    return item


def apply_primary_rules(db: Session, model: Any, client_id: int, current_id: int) -> None:
    db.query(model).filter(model.client_id == client_id, model.id != current_id).update(
        {model.is_primary: False}, synchronize_session=False
    )


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


# The row columns and the stat cards must agree on what "active" means, so both
# read these instead of repeating the literals.
ACTIVE_CONTRACT_STATUSES = {"signed", "active"}
CLOSED_ORDER_STATUSES = {"cancelled", "closed", "delivered"}


def serialize_list_item(client: Client) -> ClientListItem:
    primary_contact = next((contact for contact in client.contacts if contact.is_primary), None)
    if primary_contact is None and client.contacts:
        primary_contact = client.contacts[0]
    legal_address = next(
        (address for address in client.addresses if address.address_type == AddressType.legal), None
    )
    first_address = legal_address or (client.addresses[0] if client.addresses else None)
    return ClientListItem(
        id=client.id,
        name=client.name,
        inn=client.inn,
        oked=client.oked,
        phone=client.phone,
        email=client.email,
        notes=client.notes,
        created_at=client.created_at,
        updated_at=client.updated_at,
        primary_contact=primary_contact,
        primary_region=first_address.region if first_address else None,
        legal_address=legal_address.address if legal_address else None,
        active_contracts=sum(1 for contract in client.contracts if contract.status in ACTIVE_CONTRACT_STATUSES),
        active_orders=sum(1 for order in client.orders if order.status not in CLOSED_ORDER_STATUSES),
        last_activity=None,
    )


def client_filters(
    *,
    search: str | None = None,
    name: str | None = None,
    inn: str | None = None,
    phone: str | None = None,
    contact_person: str | None = None,
    region: str | None = None,
) -> list:
    """Filter clauses for the client list.

    Shared by the list and the stats endpoint. The stat cards sit directly above
    the table, so they have to be counted over the same selection the table
    shows -- otherwise a filtered page reports figures for clients that are not
    on it.
    """
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(
            or_(
                Client.name.ilike(value),
                Client.inn.ilike(value),
                Client.phone.ilike(value),
                ClientContact.full_name.ilike(value),
                ClientAddress.region.ilike(value),
            )
        )
    if name:
        filters.append(Client.name.ilike(f"%{name}%"))
    if inn:
        filters.append(Client.inn.ilike(f"%{inn}%"))
    if phone:
        filters.append(or_(Client.phone.ilike(f"%{phone}%"), ClientContact.phone.ilike(f"%{phone}%")))
    if contact_person:
        filters.append(ClientContact.full_name.ilike(f"%{contact_person}%"))
    if region:
        filters.append(ClientAddress.region.ilike(f"%{region}%"))
    return filters


# The region shown in a row is the legal address, falling back to the first
# address -- the sort has to pick the same one or the column would order by a
# value the user cannot see.
REGION_EXPR = (
    select(ClientAddress.region)
    .where(ClientAddress.client_id == Client.id)
    .order_by(ClientAddress.address_type != AddressType.legal, ClientAddress.id)
    .limit(1)
    .scalar_subquery()
)
ACTIVE_CONTRACTS_EXPR = (
    select(func.count(Contract.id))
    .where(Contract.client_id == Client.id, Contract.status.in_(ACTIVE_CONTRACT_STATUSES))
    .scalar_subquery()
)
ACTIVE_ORDERS_EXPR = (
    select(func.count(Order.id))
    .where(Order.client_id == Client.id, Order.status.notin_(CLOSED_ORDER_STATUSES))
    .scalar_subquery()
)
SORTABLE_COLUMNS = {
    "name": func.lower(Client.name),
    "inn": Client.inn,
    "phone": Client.phone,
    "region": REGION_EXPR,
    "active_contracts": ACTIVE_CONTRACTS_EXPR,
    "active_orders": ACTIVE_ORDERS_EXPR,
    "created_at": Client.created_at,
}
DEFAULT_SORT = "created_at"


def selected_client_ids(filters: list):
    """Ids of the clients the filters select.

    The filters reach through to contacts and addresses, so a client with two
    addresses would otherwise come back twice. Collapsing to distinct ids here
    and selecting the rows by id keeps the outer query free of DISTINCT, which
    is what lets it be ordered by a subquery (region, contract counts).
    """
    stmt = select(Client.id).outerjoin(ClientContact).outerjoin(ClientAddress).distinct()
    return stmt.where(*filters) if filters else stmt


def apply_client_sort(stmt, sort: str | None, order: str | None):
    column = SORTABLE_COLUMNS.get(sort or DEFAULT_SORT, SORTABLE_COLUMNS[DEFAULT_SORT])
    descending = (order or "").lower() == "desc"
    direction = column.desc() if descending else column.asc()
    # Rows with no value belong at the end either way -- sorting by region
    # otherwise opens with a block of dashes, which reads as broken.
    # Client.id last so equal values keep a stable order across pages.
    return stmt.order_by(nullslast(direction), Client.id.asc())


@router.get("", response_model=Page[ClientListItem])
def list_clients(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    name: str | None = None,
    inn: str | None = None,
    phone: str | None = None,
    contact_person: str | None = None,
    region: str | None = None,
    search: str | None = None,
    sort: str | None = Query(default=None),
    order: str | None = Query(default=None),
):
    filters = client_filters(
        search=search, name=name, inn=inn, phone=phone, contact_person=contact_person, region=region
    )
    ids = selected_client_ids(filters)
    total = db.scalar(select(func.count()).select_from(ids.subquery())) or 0
    stmt = apply_client_sort(
        select(Client)
        .where(Client.id.in_(ids))
        .options(
            selectinload(Client.contacts),
            selectinload(Client.addresses),
            selectinload(Client.contracts),
            selectinload(Client.orders),
        ),
        sort,
        order or ("desc" if not sort else "asc"),
    )
    clients = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_list_item(client) for client in clients], total=total, page=page, page_size=page_size)


@router.get("/overview")
def clients_overview(
    db: Session = Depends(get_db),
    name: str | None = None,
    inn: str | None = None,
    phone: str | None = None,
    contact_person: str | None = None,
    region: str | None = None,
    search: str | None = None,
):
    """Stat cards for the client list, plus the filter dropdown choices.

    The two halves deliberately answer different questions:

    * **stats** count the *filtered* selection, so the cards always describe the
      rows on screen. Previously the page summed whatever the first few
      unfiltered pages happened to contain, so filtering by region left the
      "faol shartnomalar" card showing a company-wide number next to a table
      whose every row said 0.
    * **options** list *every* region and contact in the database, unfiltered on
      purpose -- narrowing them to the current selection would drop every other
      region out of the dropdown and leave no way to switch away from it.
    """
    filters = client_filters(
        search=search, name=name, inn=inn, phone=phone, contact_person=contact_person, region=region
    )
    selected_ids = selected_client_ids(filters)

    total = db.scalar(select(func.count()).select_from(selected_ids.subquery())) or 0
    active_contracts = db.scalar(
        select(func.count())
        .select_from(Contract)
        .where(Contract.client_id.in_(selected_ids), Contract.status.in_(ACTIVE_CONTRACT_STATUSES))
    ) or 0
    active_orders = db.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.client_id.in_(selected_ids), Order.status.notin_(CLOSED_ORDER_STATUSES))
    ) or 0

    regions = db.scalars(
        select(ClientAddress.region).where(ClientAddress.region.isnot(None)).distinct().order_by(ClientAddress.region)
    ).all()
    contacts = db.scalars(
        select(ClientContact.full_name)
        .where(ClientContact.full_name.isnot(None))
        .distinct()
        .order_by(ClientContact.full_name)
    ).all()

    return {
        "stats": {"total": total, "active_contracts": active_contracts, "active_orders": active_orders},
        "options": {
            "regions": [r for r in regions if r and r.strip()],
            "contacts": [c for c in contacts if c and c.strip()],
        },
    }


EXPORT_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/export.xlsx")
def export_clients(
    db: Session = Depends(get_db),
    name: str | None = None,
    inn: str | None = None,
    phone: str | None = None,
    contact_person: str | None = None,
    region: str | None = None,
    search: str | None = None,
    sort: str | None = Query(default=None),
    order: str | None = Query(default=None),
    ids: str | None = Query(default=None, description="Vergul bilan ajratilgan id lar"),
    lang: str = Query(default="cyr"),
    filter_note: str = Query(default="", max_length=500),
):
    """The current selection as a spreadsheet -- every filtered row, not a page.

    Takes the same filter and sort parameters as the list, so whatever is on
    screen is exactly what lands in the file. `ids` narrows it further to a
    hand-picked set, which is what the row checkboxes send.
    """
    filters = client_filters(
        search=search, name=name, inn=inn, phone=phone, contact_person=contact_person, region=region
    )
    picked = [int(part) for part in (ids or "").split(",") if part.strip().isdigit()]
    stmt = apply_client_sort(
        select(Client)
        .where(Client.id.in_(selected_client_ids(filters)))
        .where(Client.id.in_(picked) if picked else true())
        .options(
            selectinload(Client.contacts),
            selectinload(Client.addresses),
            selectinload(Client.contracts),
            selectinload(Client.orders),
        ),
        sort,
        order or ("desc" if not sort else "asc"),
    )
    items = [serialize_list_item(client) for client in db.scalars(stmt).unique()]
    stream = client_export.build_workbook(items, lang, filter_note)
    filename = f"mijozlar_{date.today():%Y-%m-%d}.xlsx"
    return StreamingResponse(
        stream,
        media_type=EXPORT_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("/bulk-delete", dependencies=[Depends(require_edit("sotuv"))])
def bulk_delete_clients(payload: ClientBulkDelete, db: Session = Depends(get_db)):
    """Delete several clients, reporting each one separately.

    A client that already has contracts, orders, batches, invoices or payments
    cannot be deleted -- the same rule the single delete enforces. Rather than
    failing the whole request on the first such client, each id is committed on
    its own and the blocked ones come back with their reason, so the user can
    see which of their selection survived and why.
    """
    deleted: list[int] = []
    blocked: list[dict] = []
    for client_id in dict.fromkeys(payload.ids):  # keep order, drop repeats
        client = db.get(Client, client_id)
        if client is None:
            blocked.append({"id": client_id, "name": None, "reason": "Mijoz topilmadi."})
            continue
        try:
            ensure_client_has_no_activity(db, client_id)
        except HTTPException as error:
            blocked.append({"id": client_id, "name": client.name, "reason": error.detail})
            continue
        db.delete(client)
        db.commit()
        deleted.append(client_id)
    return {"deleted": deleted, "blocked": blocked}


def ensure_inn_available(db: Session, inn: str | None, exclude_client_id: int | None = None) -> None:
    if not inn:
        return
    stmt = select(Client).where(Client.inn == inn)
    if exclude_client_id:
        stmt = stmt.where(Client.id != exclude_client_id)
    existing = db.scalars(stmt).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bu STIR bilan mijoz allaqachon mavjud: {existing.name} (ID {existing.id}).",
        )


@router.post("", response_model=ClientDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    ensure_inn_available(db, payload.inn)
    data = payload.model_dump(exclude={"first_contact", "address", "bank_account"})
    client = Client(**data)
    db.add(client)
    db.flush()
    if payload.first_contact:
        contact = ClientContact(client_id=client.id, **payload.first_contact.model_dump())
        db.add(contact)
        db.flush()
        if contact.is_primary:
            apply_primary_rules(db, ClientContact, client.id, contact.id)
    if payload.address:
        db.add(ClientAddress(client_id=client.id, **payload.address.model_dump()))
    if payload.bank_account:
        account = ClientBankAccount(client_id=client.id, **payload.bank_account.model_dump())
        db.add(account)
        db.flush()
        if account.is_primary:
            apply_primary_rules(db, ClientBankAccount, client.id, account.id)
    db.commit()
    return get_client_detail(client.id, db)


@router.get("/{client_id}", response_model=ClientDetail)
def get_client_detail(client_id: int, db: Session = Depends(get_db)):
    client = db.scalars(
        select(Client)
        .where(Client.id == client_id)
        .options(
            selectinload(Client.contacts),
            selectinload(Client.addresses),
            selectinload(Client.bank_accounts),
            selectinload(Client.documents),
            selectinload(Client.notes_history),
            selectinload(Client.contracts),
            selectinload(Client.orders),
        )
    ).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mijoz topilmadi.")
    detail = ClientDetail.model_validate(client)
    detail.active_contracts = sum(1 for contract in client.contracts if contract.status in {"signed", "active"})
    detail.active_orders = sum(1 for order in client.orders if order.status not in {"cancelled", "closed", "delivered"})
    return detail


@router.patch("/{client_id}", response_model=ClientRead, dependencies=[Depends(require_edit("sotuv"))])
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)):
    client = get_client_or_404(db, client_id)
    data = payload.model_dump(exclude_unset=True)
    if "inn" in data:
        ensure_inn_available(db, data["inn"], exclude_client_id=client_id)
    update_model(client, data)
    db.commit()
    db.refresh(client)
    return client


def ensure_client_has_no_activity(db: Session, client_id: int) -> None:
    checks = (
        (Contract, "shartnomalari"),
        (Order, "buyurtmalari"),
        (DeliveryBatch, "yetkazib berish partiyalari"),
        (CustomerInvoice, "hisob-fakturalari"),
        (CustomerPayment, "to'lovlari"),
    )
    for model, label in checks:
        if db.scalar(select(func.count()).where(model.client_id == client_id)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Mijozni o'chirib bo'lmaydi: uning {label} mavjud. Avval ularni o'chiring yoki boshqa mijozga bog'lang.",
            )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = get_client_or_404(db, client_id)
    ensure_client_has_no_activity(db, client_id)
    db.delete(client)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{client_id}/contacts", response_model=ClientContactRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_contact(client_id: int, payload: ClientContactCreate, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    contact = ClientContact(client_id=client_id, **payload.model_dump())
    db.add(contact)
    db.flush()
    if contact.is_primary:
        apply_primary_rules(db, ClientContact, client_id, contact.id)
    db.commit()
    db.refresh(contact)
    return contact


@router.patch("/{client_id}/contacts/{contact_id}", response_model=ClientContactRead, dependencies=[Depends(require_edit("sotuv"))])
def update_contact(client_id: int, contact_id: int, payload: ClientContactUpdate, db: Session = Depends(get_db)):
    contact = get_child_or_404(db, ClientContact, client_id, contact_id)
    update_model(contact, payload.model_dump(exclude_unset=True))
    db.flush()
    if contact.is_primary:
        apply_primary_rules(db, ClientContact, client_id, contact.id)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{client_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_contact(client_id: int, contact_id: int, db: Session = Depends(get_db)):
    contact = get_child_or_404(db, ClientContact, client_id, contact_id)
    db.delete(contact)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{client_id}/contacts/{contact_id}/primary", response_model=ClientContactRead, dependencies=[Depends(require_edit("sotuv"))])
def set_primary_contact(client_id: int, contact_id: int, db: Session = Depends(get_db)):
    contact = get_child_or_404(db, ClientContact, client_id, contact_id)
    contact.is_primary = True
    apply_primary_rules(db, ClientContact, client_id, contact.id)
    db.commit()
    db.refresh(contact)
    return contact


@router.post("/{client_id}/addresses", response_model=ClientAddressRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_address(client_id: int, payload: ClientAddressCreate, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    address = ClientAddress(client_id=client_id, **payload.model_dump())
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@router.patch("/{client_id}/addresses/{address_id}", response_model=ClientAddressRead, dependencies=[Depends(require_edit("sotuv"))])
def update_address(client_id: int, address_id: int, payload: ClientAddressUpdate, db: Session = Depends(get_db)):
    address = get_child_or_404(db, ClientAddress, client_id, address_id)
    update_model(address, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(address)
    return address


@router.delete("/{client_id}/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_address(client_id: int, address_id: int, db: Session = Depends(get_db)):
    address = get_child_or_404(db, ClientAddress, client_id, address_id)
    db.delete(address)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{client_id}/bank-accounts", response_model=ClientBankAccountRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_bank_account(client_id: int, payload: ClientBankAccountCreate, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    account = ClientBankAccount(client_id=client_id, **payload.model_dump())
    db.add(account)
    db.flush()
    if account.is_primary:
        apply_primary_rules(db, ClientBankAccount, client_id, account.id)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/{client_id}/bank-accounts/{account_id}", response_model=ClientBankAccountRead, dependencies=[Depends(require_edit("sotuv"))])
def update_bank_account(client_id: int, account_id: int, payload: ClientBankAccountUpdate, db: Session = Depends(get_db)):
    account = get_child_or_404(db, ClientBankAccount, client_id, account_id)
    update_model(account, payload.model_dump(exclude_unset=True))
    db.flush()
    if account.is_primary:
        apply_primary_rules(db, ClientBankAccount, client_id, account.id)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{client_id}/bank-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_bank_account(client_id: int, account_id: int, db: Session = Depends(get_db)):
    account = get_child_or_404(db, ClientBankAccount, client_id, account_id)
    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{client_id}/bank-accounts/{account_id}/primary", response_model=ClientBankAccountRead, dependencies=[Depends(require_edit("sotuv"))])
def set_primary_bank_account(client_id: int, account_id: int, db: Session = Depends(get_db)):
    account = get_child_or_404(db, ClientBankAccount, client_id, account_id)
    account.is_primary = True
    apply_primary_rules(db, ClientBankAccount, client_id, account.id)
    db.commit()
    db.refresh(account)
    return account


@router.post("/{client_id}/documents", response_model=ClientDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_document(client_id: int, payload: ClientDocumentCreate, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    document = ClientDocument(client_id=client_id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{client_id}/documents/{document_id}", response_model=ClientDocumentRead, dependencies=[Depends(require_edit("sotuv"))])
def update_document(client_id: int, document_id: int, payload: ClientDocumentUpdate, db: Session = Depends(get_db)):
    document = get_child_or_404(db, ClientDocument, client_id, document_id)
    update_model(document, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{client_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_document(client_id: int, document_id: int, db: Session = Depends(get_db)):
    document = get_child_or_404(db, ClientDocument, client_id, document_id)
    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{client_id}/notes", response_model=ClientNoteRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_note(client_id: int, payload: ClientNoteCreate, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    note = ClientNote(client_id=client_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{client_id}/notes/{note_id}", response_model=ClientNoteRead, dependencies=[Depends(require_edit("sotuv"))])
def update_note(client_id: int, note_id: int, payload: ClientNoteUpdate, db: Session = Depends(get_db)):
    note = get_child_or_404(db, ClientNote, client_id, note_id)
    update_model(note, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{client_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_note(client_id: int, note_id: int, db: Session = Depends(get_db)):
    note = get_child_or_404(db, ClientNote, client_id, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
