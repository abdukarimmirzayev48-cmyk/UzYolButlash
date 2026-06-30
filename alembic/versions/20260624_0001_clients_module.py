"""clients module

Revision ID: 20260624_0001
Revises:
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260624_0001"
down_revision = None
branch_labels = None
depends_on = None


address_type = sa.Enum("legal", "delivery", "railway_station", "warehouse", name="addresstype")
document_type = sa.Enum("requisites", "certificate", "power_of_attorney", "company_card", "other", name="documenttype")


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("inn", sa.String(length=32), nullable=True),
        sa.Column("oked", sa.String(length=32), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clients_id"), "clients", ["id"], unique=False)
    op.create_index(op.f("ix_clients_inn"), "clients", ["inn"], unique=False)
    op.create_index(op.f("ix_clients_name"), "clients", ["name"], unique=False)
    op.create_index(op.f("ix_clients_phone"), "clients", ["phone"], unique=False)

    op.create_table(
        "client_addresses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("address_type", address_type, nullable=False),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.Column("district", sa.String(length=255), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("latitude", sa.String(length=64), nullable=True),
        sa.Column("longitude", sa.String(length=64), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_addresses_address_type"), "client_addresses", ["address_type"], unique=False)
    op.create_index(op.f("ix_client_addresses_client_id"), "client_addresses", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_addresses_region"), "client_addresses", ["region"], unique=False)

    op.create_table(
        "client_bank_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("mfo", sa.String(length=32), nullable=True),
        sa.Column("account_number", sa.String(length=64), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_bank_accounts_client_id"), "client_bank_accounts", ["client_id"], unique=False)

    op.create_table(
        "client_contacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_contacts_client_id"), "client_contacts", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_contacts_phone"), "client_contacts", ["phone"], unique=False)

    op.create_table(
        "client_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("document_type", document_type, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_documents_client_id"), "client_documents", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_documents_document_type"), "client_documents", ["document_type"], unique=False)

    op.create_table(
        "client_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_notes_client_id"), "client_notes", ["client_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_client_notes_client_id"), table_name="client_notes")
    op.drop_table("client_notes")
    op.drop_index(op.f("ix_client_documents_document_type"), table_name="client_documents")
    op.drop_index(op.f("ix_client_documents_client_id"), table_name="client_documents")
    op.drop_table("client_documents")
    op.drop_index(op.f("ix_client_contacts_phone"), table_name="client_contacts")
    op.drop_index(op.f("ix_client_contacts_client_id"), table_name="client_contacts")
    op.drop_table("client_contacts")
    op.drop_index(op.f("ix_client_bank_accounts_client_id"), table_name="client_bank_accounts")
    op.drop_table("client_bank_accounts")
    op.drop_index(op.f("ix_client_addresses_region"), table_name="client_addresses")
    op.drop_index(op.f("ix_client_addresses_client_id"), table_name="client_addresses")
    op.drop_index(op.f("ix_client_addresses_address_type"), table_name="client_addresses")
    op.drop_table("client_addresses")
    op.drop_index(op.f("ix_clients_phone"), table_name="clients")
    op.drop_index(op.f("ix_clients_name"), table_name="clients")
    op.drop_index(op.f("ix_clients_inn"), table_name="clients")
    op.drop_index(op.f("ix_clients_id"), table_name="clients")
    op.drop_table("clients")
    document_type.drop(op.get_bind(), checkfirst=True)
    address_type.drop(op.get_bind(), checkfirst=True)
