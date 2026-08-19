"""Re-score PDF-parsed contracts and drop the debris the parser stored

Revision ID: 20260819_0037
Revises: 20260819_0036
Create Date: 2026-08-19

Confidence was "how many required fields came back non-empty". A parse holding a
Didox id of "//my", a catalog code of "у", a unit price of 1.00 and a total of
11.2 so'm for ten tonnes therefore scored 1.00, and the review screen announced
100% certainty in the largest text on the page.

The parser no longer works that way. This brings the rows already in the table
onto the same footing, by running the same checks over the stored values:

* confidence is recomputed and the reasons are written into parse_warnings, so
  a contract that needs checking says so instead of claiming to be perfect;
* values that cannot be what they claim -- a document id that is not an id, a
  catalog code that is not 17 digits -- are cleared, because an empty field
  invites correction while a wrong one does not;
* title and notes are cleared on parsed contracts. They were filled from the
  customer name (truncated) and from a slice out of the middle of the payment
  clause; neither is what the field means.

Only parsed contracts are touched -- rows with a parser_version. Nothing
entered by hand is changed, and no amount is changed anywhere.
"""

import json
import re
from decimal import Decimal

from alembic import op
import sqlalchemy as sa

revision = "20260819_0037"
down_revision = "20260819_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Imported here rather than at module scope: a migration must keep working
    # after the service it borrows from moves on.
    from backend.app.services import contract_parse_checks as checks

    bind = op.get_bind()
    contracts = bind.execute(
        sa.text(
            "SELECT id, contract_number, contract_date, valid_until, customer_name, customer_inn, "
            "executor_name, executor_inn, total_amount, didox_id, rouming_id "
            "FROM contracts WHERE parser_version IS NOT NULL"
        )
    ).fetchall()

    for row in contracts:
        items = bind.execute(
            sa.text(
                "SELECT id, product_name, quantity, unit_price, catalog_code, product_code "
                "FROM contract_items WHERE contract_id = :cid"
            ),
            {"cid": row.id},
        ).fetchall()

        # A stand-in shaped like the parser's result, so the same checks run
        # over stored rows without a second copy of the rules.
        stored = type(
            "StoredContract",
            (),
            {
                "contract_number": row.contract_number,
                "contract_date": row.contract_date,
                "valid_until": row.valid_until,
                "customer": {"name": row.customer_name, "inn": row.customer_inn},
                "executor": {"name": row.executor_name, "inn": row.executor_inn},
                "items": [
                    {
                        "product_name": i.product_name,
                        "quantity": Decimal(str(i.quantity or 0)),
                        "unit_price": Decimal(str(i.unit_price or 0)),
                    }
                    for i in items
                ],
                "totals": {"total_with_vat": Decimal(str(row.total_amount or 0))},
            },
        )()

        score, warnings = checks.confidence_and_warnings(stored)

        for key, value in (("didox_id", row.didox_id), ("rouming_id", row.rouming_id)):
            cleaned, warning = checks.clean_document_id(value)
            if warning:
                warnings.append(warning)
            if cleaned != value:
                bind.execute(
                    sa.text(f"UPDATE contracts SET {key} = :v WHERE id = :id"),
                    {"v": cleaned, "id": row.id},
                )

        for item in items:
            for key, label in (("catalog_code", "Katalog kodi"), ("product_code", "Mahsulot kodi")):
                value = getattr(item, key)
                cleaned, warning = checks.clean_catalog_code(value, label)
                if warning:
                    warnings.append(warning)
                if cleaned != value:
                    bind.execute(
                        sa.text(f"UPDATE contract_items SET {key} = :v WHERE id = :id"),
                        {"v": cleaned, "id": item.id},
                    )

        bind.execute(
            sa.text(
                "UPDATE contracts SET parse_confidence = :score, parse_warnings = :warnings, "
                "title = NULL, notes = NULL WHERE id = :id"
            ),
            {"score": str(score), "warnings": json.dumps(warnings, ensure_ascii=False), "id": row.id},
        )


def downgrade() -> None:
    # The discarded values were wrong; there is nothing worth restoring.
    pass
