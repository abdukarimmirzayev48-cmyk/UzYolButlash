"""customer requests module

Revision ID: 20260705_0013
Revises: 20260701_0012
Create Date: 2026-07-05
"""

from datetime import datetime
from decimal import Decimal

from alembic import op
import sqlalchemy as sa


revision = "20260705_0013"
down_revision = "20260701_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_registry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("inn", sa.String(length=32), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("oked", sa.String(length=32), nullable=True),
        sa.Column("director_full_name", sa.String(length=255), nullable=True),
        sa.Column("legal_address", sa.Text(), nullable=True),
        sa.Column("bank_account", sa.String(length=64), nullable=True),
        sa.Column("bank_name", sa.String(length=255), nullable=True),
        sa.Column("mfo", sa.String(length=32), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("inn"),
    )
    op.create_index(op.f("ix_company_registry_id"), "company_registry", ["id"], unique=False)
    op.create_index(op.f("ix_company_registry_inn"), "company_registry", ["inn"], unique=True)
    op.create_index(op.f("ix_company_registry_company_name"), "company_registry", ["company_name"], unique=False)

    op.create_table(
        "customer_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_number", sa.String(length=32), nullable=False),
        sa.Column("customer_type", sa.String(length=32), nullable=False),
        sa.Column("payment_source", sa.String(length=32), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("inn", sa.String(length=32), nullable=True),
        sa.Column("oked", sa.String(length=32), nullable=True),
        sa.Column("director_full_name", sa.String(length=255), nullable=True),
        sa.Column("legal_address", sa.Text(), nullable=True),
        sa.Column("bank_account", sa.String(length=64), nullable=True),
        sa.Column("bank_name", sa.String(length=255), nullable=True),
        sa.Column("mfo", sa.String(length=32), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("contact_full_name", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=64), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("total_quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("internal_comment", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("contract_signed_at", sa.DateTime(), nullable=True),
        sa.Column("converted_to_order_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_number"),
    )
    op.create_index(op.f("ix_customer_requests_id"), "customer_requests", ["id"], unique=False)
    op.create_index(op.f("ix_customer_requests_request_number"), "customer_requests", ["request_number"], unique=True)
    op.create_index(op.f("ix_customer_requests_customer_type"), "customer_requests", ["customer_type"], unique=False)
    op.create_index(op.f("ix_customer_requests_payment_source"), "customer_requests", ["payment_source"], unique=False)
    op.create_index(op.f("ix_customer_requests_company_name"), "customer_requests", ["company_name"], unique=False)
    op.create_index(op.f("ix_customer_requests_inn"), "customer_requests", ["inn"], unique=False)
    op.create_index(op.f("ix_customer_requests_phone"), "customer_requests", ["phone"], unique=False)
    op.create_index(op.f("ix_customer_requests_contact_full_name"), "customer_requests", ["contact_full_name"], unique=False)
    op.create_index(op.f("ix_customer_requests_product_id"), "customer_requests", ["product_id"], unique=False)
    op.create_index(op.f("ix_customer_requests_status"), "customer_requests", ["status"], unique=False)

    op.create_table(
        "customer_request_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["customer_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_request_schedules_request_id"), "customer_request_schedules", ["request_id"], unique=False)

    op.create_table(
        "customer_request_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("old_status", sa.String(length=32), nullable=True),
        sa.Column("new_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by", sa.String(length=255), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["customer_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_request_status_history_request_id"), "customer_request_status_history", ["request_id"], unique=False)
    op.create_index(op.f("ix_customer_request_status_history_new_status"), "customer_request_status_history", ["new_status"], unique=False)

    seed_data()


def seed_data() -> None:
    now = datetime.utcnow()
    company_registry = sa.table(
        "company_registry",
        sa.column("inn", sa.String),
        sa.column("company_name", sa.String),
        sa.column("oked", sa.String),
        sa.column("director_full_name", sa.String),
        sa.column("legal_address", sa.Text),
        sa.column("bank_account", sa.String),
        sa.column("bank_name", sa.String),
        sa.column("mfo", sa.String),
        sa.column("phone", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        company_registry,
        [
            {
                "inn": "206840820",
                "company_name": "\"BUXORO YO'LLARDAN MUNTAZAM FOYDALANISH KORXONASI\" DAVLAT MUASSASASI",
                "oked": "42110",
                "director_full_name": "SIROJOV MIRSHOD YASHIN O'G'LI",
                "legal_address": "Buxoro viloyati, Oq Masjid ko'chasi",
                "bank_account": "22626000404579890009",
                "bank_name": "TIF MILLIY BANKI AJ BOSH OFISI",
                "mfo": "00450",
                "phone": "+998901234567",
                "created_at": now,
                "updated_at": now,
            },
            {
                "inn": "201058958",
                "company_name": "\"O'ZYO'LBUTLASH RESPUBLIKA TA'MINOT BOSHQARMASI\" DM",
                "oked": "46140",
                "director_full_name": "XO'JAKULOV OYBEK RAYIMBERDIYEVICH",
                "legal_address": "Toshkent shahri, Mirzo Ulug'bek tumani, Mustaqillik shoh ko'chasi, 68-uy",
                "bank_account": "20210000900126953001",
                "bank_name": "IPOTEKA-BANK ATIB YUNUSOBOD FILIALI",
                "mfo": "00837",
                "phone": "+998901112233",
                "created_at": now,
                "updated_at": now,
            },
            {
                "inn": "301234567",
                "company_name": "TOSHKENT YO'L QURILISH MCHJ",
                "oked": "42110",
                "director_full_name": "KARIMOV AZIZBEK ANVAR O'G'LI",
                "legal_address": "Toshkent viloyati, Zangiota tumani",
                "bank_account": "20208000123456789001",
                "bank_name": "MILLIY BANK TOSHKENT FILIALI",
                "mfo": "00444",
                "phone": "+998909998877",
                "created_at": now,
                "updated_at": now,
            },
        ],
    )

    connection = op.get_bind()
    product_60 = connection.execute(
        sa.text("SELECT id, unit FROM products WHERE name IN (:primary_name, :fallback_name) ORDER BY id LIMIT 1"),
        {"primary_name": "Bitum BND 60/90", "fallback_name": "BND 60/90"},
    ).first()
    product_90 = connection.execute(
        sa.text("SELECT id, unit FROM products WHERE name IN (:primary_name, :fallback_name) ORDER BY id LIMIT 1"),
        {"primary_name": "Bitum BND 90/130", "fallback_name": "BND 70/100"},
    ).first()
    if not (product_60 and product_90):
        return

    requests = sa.table(
        "customer_requests",
        sa.column("request_number", sa.String),
        sa.column("customer_type", sa.String),
        sa.column("payment_source", sa.String),
        sa.column("company_name", sa.String),
        sa.column("inn", sa.String),
        sa.column("oked", sa.String),
        sa.column("director_full_name", sa.String),
        sa.column("legal_address", sa.Text),
        sa.column("bank_account", sa.String),
        sa.column("bank_name", sa.String),
        sa.column("mfo", sa.String),
        sa.column("phone", sa.String),
        sa.column("contact_full_name", sa.String),
        sa.column("contact_phone", sa.String),
        sa.column("product_id", sa.Integer),
        sa.column("total_quantity", sa.Numeric),
        sa.column("unit", sa.String),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        requests,
        [
            {
                "request_number": "REQ-000001",
                "customer_type": "internal_organization",
                "payment_source": "treasury",
                "company_name": "\"BUXORO YO'LLARDAN MUNTAZAM FOYDALANISH KORXONASI\" DAVLAT MUASSASASI",
                "inn": "206840820",
                "oked": "42110",
                "director_full_name": "SIROJOV MIRSHOD YASHIN O'G'LI",
                "legal_address": "Buxoro viloyati, Oq Masjid ko'chasi",
                "bank_account": "22626000404579890009",
                "bank_name": "TIF MILLIY BANKI AJ BOSH OFISI",
                "mfo": "00450",
                "phone": "+998901234567",
                "contact_full_name": "Mansur Qurbonov",
                "contact_phone": "+998901234567",
                "product_id": product_60.id,
                "total_quantity": Decimal("150"),
                "unit": product_60.unit,
                "status": "new",
                "created_at": now,
                "updated_at": now,
            },
            {
                "request_number": "REQ-000002",
                "customer_type": "external_customer",
                "payment_source": "bank",
                "company_name": "SAMARQAND ROAD SERVICE MCHJ",
                "inn": "302345678",
                "oked": "42110",
                "director_full_name": "RAHIMOV DILSHOD BAXTIYOROVICH",
                "legal_address": "Samarqand shahri, Registon ko'chasi, 45-uy",
                "bank_account": "20208000987654321001",
                "bank_name": "HAMKORBANK SAMARQAND FILIALI",
                "mfo": "01122",
                "phone": "+998662223344",
                "contact_full_name": "Dilshod Rahimov",
                "contact_phone": "+998662223344",
                "product_id": product_90.id,
                "total_quantity": Decimal("90"),
                "unit": product_90.unit,
                "status": "reviewing",
                "created_at": now,
                "updated_at": now,
            },
        ],
    )

    schedules = sa.table(
        "customer_request_schedules",
        sa.column("request_id", sa.Integer),
        sa.column("year", sa.Integer),
        sa.column("month", sa.Integer),
        sa.column("quantity", sa.Numeric),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        schedules,
        [
            {"request_id": 1, "year": 2026, "month": 7, "quantity": Decimal("50"), "created_at": now, "updated_at": now},
            {"request_id": 1, "year": 2026, "month": 8, "quantity": Decimal("50"), "created_at": now, "updated_at": now},
            {"request_id": 1, "year": 2026, "month": 9, "quantity": Decimal("50"), "created_at": now, "updated_at": now},
            {"request_id": 2, "year": 2026, "month": 7, "quantity": Decimal("30"), "created_at": now, "updated_at": now},
            {"request_id": 2, "year": 2026, "month": 8, "quantity": Decimal("30"), "created_at": now, "updated_at": now},
            {"request_id": 2, "year": 2026, "month": 9, "quantity": Decimal("30"), "created_at": now, "updated_at": now},
        ],
    )

    history = sa.table(
        "customer_request_status_history",
        sa.column("request_id", sa.Integer),
        sa.column("old_status", sa.String),
        sa.column("new_status", sa.String),
        sa.column("changed_by", sa.String),
        sa.column("comment", sa.Text),
        sa.column("created_at", sa.DateTime),
    )
    op.bulk_insert(
        history,
        [
            {"request_id": 1, "old_status": None, "new_status": "new", "changed_by": "system", "comment": "Talabnoma yaratildi.", "created_at": now},
            {"request_id": 2, "old_status": None, "new_status": "new", "changed_by": "system", "comment": "Talabnoma yaratildi.", "created_at": now},
            {"request_id": 2, "old_status": "new", "new_status": "reviewing", "changed_by": "system", "comment": "Ko'rib chiqishga olindi.", "created_at": now},
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_customer_request_status_history_new_status"), table_name="customer_request_status_history")
    op.drop_index(op.f("ix_customer_request_status_history_request_id"), table_name="customer_request_status_history")
    op.drop_table("customer_request_status_history")
    op.drop_index(op.f("ix_customer_request_schedules_request_id"), table_name="customer_request_schedules")
    op.drop_table("customer_request_schedules")
    op.drop_index(op.f("ix_customer_requests_status"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_product_id"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_contact_full_name"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_phone"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_inn"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_company_name"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_payment_source"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_customer_type"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_request_number"), table_name="customer_requests")
    op.drop_index(op.f("ix_customer_requests_id"), table_name="customer_requests")
    op.drop_table("customer_requests")
    op.drop_index(op.f("ix_company_registry_company_name"), table_name="company_registry")
    op.drop_index(op.f("ix_company_registry_inn"), table_name="company_registry")
    op.drop_index(op.f("ix_company_registry_id"), table_name="company_registry")
    op.drop_table("company_registry")
