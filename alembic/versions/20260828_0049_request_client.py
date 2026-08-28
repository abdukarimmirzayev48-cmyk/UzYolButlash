"""Talabnoma mijozga bog'lanadi

Revision ID: 20260828_0049
Revises: 20260828_0048
Create Date: 2026-08-28

Korxona nomi talabnomada erkin matn edi: bir mijoz uch xil yozilishi va
uning talabnomalarini bir joyga yig'ib bo'lmasligi mumkin edi. Endi u
mijozlar ro'yxatidan tanlanadi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0049"
down_revision = "20260828_0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("customer_requests") as batch:
        # SQLite da batch rejimi nomsiz cheklovni qabul qilmaydi; bog'lanish
        # modelda e'lon qilingan, ustunning o'zi oddiy son.
        batch.add_column(sa.Column("client_id", sa.Integer(), nullable=True))
    op.create_index("ix_customer_requests_client_id", "customer_requests", ["client_id"])

    # Mavjud talabnomalarni bog'laymiz: avval STIR bo'yicha, so'ng aynan
    # bir xil nom bo'yicha. Taxmin qilinmaydi -- mos kelmagani bo'sh qoladi
    # va u interfeysda ko'rinib turadi.
    bind = op.get_bind()
    by_inn = bind.execute(sa.text(
        "UPDATE customer_requests SET client_id = ("
        " SELECT c.id FROM clients c WHERE c.inn IS NOT NULL AND c.inn = customer_requests.inn LIMIT 1)"
        " WHERE client_id IS NULL AND inn IS NOT NULL"
    )).rowcount
    by_name = bind.execute(sa.text(
        "UPDATE customer_requests SET client_id = ("
        " SELECT c.id FROM clients c WHERE lower(trim(c.name)) = lower(trim(customer_requests.company_name)) LIMIT 1)"
        " WHERE client_id IS NULL"
    )).rowcount
    linked = bind.execute(sa.text("SELECT count(*) FROM customer_requests WHERE client_id IS NOT NULL")).scalar()
    total = bind.execute(sa.text("SELECT count(*) FROM customer_requests")).scalar()
    print(f"  talabnoma -> mijoz: {linked}/{total} bog'landi (STIR {by_inn}, nom {by_name})")


def downgrade() -> None:
    op.drop_index("ix_customer_requests_client_id", table_name="customer_requests")
    with op.batch_alter_table("customer_requests") as batch:
        batch.drop_column("client_id")
