from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.client import AddressType, Client, ClientAddress, ClientBankAccount, ClientContact
from backend.app.models.customer_request import CompanyRegistry


def find_client_by_inn(db: Session, inn: str | None) -> Client | None:
    if not inn:
        return None
    return db.scalars(select(Client).where(Client.inn == inn)).first()


def find_registry_by_inn(db: Session, inn: str | None) -> CompanyRegistry | None:
    if not inn:
        return None
    return db.scalars(select(CompanyRegistry).where(CompanyRegistry.inn == inn)).first()


def enrich_client_fields(
    db: Session,
    client: Client,
    *,
    oked: str | None = None,
    phone: str | None = None,
    region: str | None = None,
    legal_address: str | None = None,
    bank_name: str | None = None,
    mfo: str | None = None,
    bank_account: str | None = None,
    director_full_name: str | None = None,
) -> list[str]:
    """Fill gaps on a client from an authoritative source (registry or a parsed contract).

    Only ever fills in missing fields — whatever the client already has always
    wins; this exists to backfill blanks, not to overwrite recorded data.
    """
    changed: list[str] = []
    if not client.oked and oked:
        client.oked = oked
        changed.append("oked")
    if not client.phone and phone:
        client.phone = phone
        changed.append("phone")

    if legal_address and not any(a.address_type == AddressType.legal for a in client.addresses):
        db.add(ClientAddress(client_id=client.id, address_type=AddressType.legal, region=region, address=legal_address))
        changed.append("legal_address")

    if bank_account and not client.bank_accounts:
        db.add(ClientBankAccount(
            client_id=client.id,
            bank_name=bank_name or "Noma'lum bank",
            mfo=mfo,
            account_number=bank_account,
            is_primary=True,
        ))
        changed.append("bank_account")

    if director_full_name and not client.contacts:
        db.add(ClientContact(client_id=client.id, full_name=director_full_name, position="Direktor", phone=phone, is_primary=True))
        changed.append("director_contact")

    return changed


def enrich_client_from_registry(db: Session, client: Client, registry: CompanyRegistry) -> list[str]:
    return enrich_client_fields(
        db,
        client,
        oked=registry.oked,
        phone=registry.phone,
        region=registry.region,
        legal_address=registry.legal_address,
        bank_name=registry.bank_name,
        mfo=registry.mfo,
        bank_account=registry.bank_account,
        director_full_name=registry.director_full_name,
    )


def create_client_from_registry(db: Session, registry: CompanyRegistry) -> Client:
    client = Client(name=registry.company_name, inn=registry.inn, oked=registry.oked, phone=registry.phone)
    db.add(client)
    db.flush()
    enrich_client_from_registry(db, client, registry)
    return client
