from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.client import Client
from backend.app.services.client_matching import enrich_client_from_registry, find_registry_by_inn


def main() -> None:
    db = SessionLocal()
    try:
        clients = db.scalars(select(Client)).all()
        enriched = 0
        for client in clients:
            registry = find_registry_by_inn(db, client.inn)
            if not registry:
                continue
            changed = enrich_client_from_registry(db, client, registry)
            if changed:
                enriched += 1
                print(f"Client #{client.id} ({client.name}) enriched: {', '.join(changed)}")
        db.commit()
        print(f"Done. {enriched}/{len(clients)} clients enriched from company_registry.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
