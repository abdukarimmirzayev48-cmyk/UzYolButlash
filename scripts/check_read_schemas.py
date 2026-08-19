"""Check that every stored row can still be read back through its API schema.

Written after a validator added to a Create schema was inherited by the Read
schema through their shared base. One client had a 27-digit bank account
number, so GET /api/clients/85 returned 500 and the card could not be opened --
not even to correct the number. The rule was verified against the development
database, which did not contain that row.

So: run this against the database that matters. It loads every row of the
tables below and validates it exactly the way the API would when serving it.

    python3 scripts/check_read_schemas.py                # ./bitum.db
    python3 scripts/check_read_schemas.py /path/to.db

Exit status is non-zero when something would fail, so it can gate a deploy.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

if len(sys.argv) > 1:
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(sys.argv[1]).resolve()}"

from backend.app.db.session import SessionLocal  # noqa: E402
from backend.app.models.client import (  # noqa: E402
    Client,
    ClientAddress,
    ClientBankAccount,
    ClientContact,
)
from backend.app.models.contract import Contract, ContractItem  # noqa: E402
from backend.app.schemas.client import (  # noqa: E402
    ClientAddressRead,
    ClientBankAccountRead,
    ClientContactRead,
    ClientRead,
)
from backend.app.schemas.contract import ContractItemRead, ContractRead  # noqa: E402

# Only schemas the API validates straight from an ORM row belong here. The
# talabnoma list item is assembled by hand from several sources, so validating
# it against a bare row reports fields the serializer would have supplied and
# says nothing about whether the endpoint works.
CHECKS = [
    ("mijoz", Client, ClientRead),
    ("kontakt", ClientContact, ClientContactRead),
    ("manzil", ClientAddress, ClientAddressRead),
    ("bank hisobi", ClientBankAccount, ClientBankAccountRead),
    ("shartnoma", Contract, ContractRead),
    ("shartnoma elementi", ContractItem, ContractItemRead),
]


def main() -> int:
    db = SessionLocal()
    failures = 0
    try:
        for label, model, schema in CHECKS:
            rows = db.query(model).all()
            bad = []
            for row in rows:
                try:
                    schema.model_validate(row, from_attributes=True)
                except Exception as error:  # noqa: BLE001 -- report anything that would 500
                    reason = next(
                        (line.strip() for line in str(error).splitlines() if "Value error" in line),
                        str(error).splitlines()[-1].strip(),
                    )
                    bad.append((row.id, reason[:90]))
            status = "OK" if not bad else f"{len(bad)} ta OCHILMAYDI"
            print(f"  {label:20} {len(rows):5} qator   {status}")
            for row_id, reason in bad:
                print(f"      id={row_id}: {reason}")
            failures += len(bad)
    finally:
        db.close()

    print()
    if failures:
        print(f"{failures} ta yozuv API orqali o'qib bo'lmaydi — ular 500 qaytaradi.")
        return 1
    print("Hamma yozuv o'qiladi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
