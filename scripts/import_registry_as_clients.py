from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from backend.app.db.session import SessionLocal
from backend.app.models.customer_request import CompanyRegistry
from backend.app.services.client_matching import create_client_from_registry, find_client_by_inn


def main() -> None:
    db = SessionLocal()
    try:
        registry_rows = db.scalars(select(CompanyRegistry)).all()
        created = 0
        skipped = 0
        for registry in registry_rows:
            if find_client_by_inn(db, registry.inn):
                skipped += 1
                continue
            create_client_from_registry(db, registry)
            created += 1
        db.commit()
        print(f"Done. Created {created} clients, skipped {skipped} already-existing.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
