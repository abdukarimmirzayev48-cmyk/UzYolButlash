"""contract pdf parser support

Revision ID: 20260705_0015
Revises: 20260705_0014
Create Date: 2026-07-05
"""

from alembic import op
import sqlalchemy as sa


revision = "20260705_0015"
down_revision = "20260705_0014"
branch_labels = None
depends_on = None


parse_status = sa.Enum("parsed", "confirmed", "failed", name="contractparsesessionstatus")


def upgrade() -> None:
    with op.batch_alter_table("contracts") as batch_op:
        batch_op.alter_column("client_id", existing_type=sa.Integer(), nullable=True)

    contract_columns = [
        sa.Column("customer_request_id", sa.Integer(), nullable=True),
        sa.Column("place", sa.String(length=255), nullable=True),
        sa.Column("customer_name", sa.String(length=255), nullable=True),
        sa.Column("customer_director_full_name", sa.String(length=255), nullable=True),
        sa.Column("customer_inn", sa.String(length=32), nullable=True),
        sa.Column("customer_oked", sa.String(length=32), nullable=True),
        sa.Column("customer_legal_address", sa.Text(), nullable=True),
        sa.Column("customer_bank_account", sa.String(length=64), nullable=True),
        sa.Column("customer_bank_name", sa.String(length=255), nullable=True),
        sa.Column("customer_mfo", sa.String(length=32), nullable=True),
        sa.Column("customer_phone", sa.String(length=64), nullable=True),
        sa.Column("executor_name", sa.String(length=255), nullable=True),
        sa.Column("executor_director_full_name", sa.String(length=255), nullable=True),
        sa.Column("executor_inn", sa.String(length=32), nullable=True),
        sa.Column("executor_oked", sa.String(length=32), nullable=True),
        sa.Column("executor_legal_address", sa.Text(), nullable=True),
        sa.Column("executor_bank_account", sa.String(length=64), nullable=True),
        sa.Column("executor_bank_name", sa.String(length=255), nullable=True),
        sa.Column("executor_mfo", sa.String(length=32), nullable=True),
        sa.Column("executor_phone", sa.String(length=64), nullable=True),
        sa.Column("didox_id", sa.String(length=255), nullable=True),
        sa.Column("rouming_id", sa.String(length=255), nullable=True),
        sa.Column("source_file_path", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("parsed_text_path", sa.Text(), nullable=True),
        sa.Column("parser_version", sa.String(length=64), nullable=True),
        sa.Column("parse_confidence", sa.Numeric(5, 2), nullable=True),
        sa.Column("parse_warnings", sa.Text(), nullable=True),
    ]
    for column in contract_columns:
        op.add_column("contracts", column)
    op.create_index(op.f("ix_contracts_customer_request_id"), "contracts", ["customer_request_id"], unique=False)
    op.create_index(op.f("ix_contracts_customer_name"), "contracts", ["customer_name"], unique=False)
    op.create_index(op.f("ix_contracts_customer_inn"), "contracts", ["customer_inn"], unique=False)
    op.create_index(op.f("ix_contracts_didox_id"), "contracts", ["didox_id"], unique=False)
    op.create_index(op.f("ix_contracts_rouming_id"), "contracts", ["rouming_id"], unique=False)

    for column in (
        sa.Column("product_brand", sa.String(length=128), nullable=True),
        sa.Column("catalog_code", sa.String(length=128), nullable=True),
        sa.Column("barcode", sa.String(length=128), nullable=True),
    ):
        op.add_column("contract_items", column)

    op.create_table(
        "contract_parse_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("parsed_text_path", sa.Text(), nullable=True),
        sa.Column("parsed_data_json", sa.Text(), nullable=False),
        sa.Column("warnings_json", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 2), nullable=True),
        sa.Column("status", parse_status, nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_contract_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_contract_id"], ["contracts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contract_parse_sessions_id"), "contract_parse_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_contract_parse_sessions_status"), "contract_parse_sessions", ["status"], unique=False)

    op.create_table(
        "contract_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=True),
        sa.Column("parse_session_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_type", sa.String(length=64), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parse_session_id"], ["contract_parse_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contract_files_contract_id"), "contract_files", ["contract_id"], unique=False)
    op.create_index(op.f("ix_contract_files_parse_session_id"), "contract_files", ["parse_session_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("contracts") as batch_op:
        batch_op.alter_column("client_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index(op.f("ix_contract_files_parse_session_id"), table_name="contract_files")
    op.drop_index(op.f("ix_contract_files_contract_id"), table_name="contract_files")
    op.drop_table("contract_files")
    op.drop_index(op.f("ix_contract_parse_sessions_status"), table_name="contract_parse_sessions")
    op.drop_index(op.f("ix_contract_parse_sessions_id"), table_name="contract_parse_sessions")
    op.drop_table("contract_parse_sessions")
    for name in ("barcode", "catalog_code", "product_brand"):
        op.drop_column("contract_items", name)
    for index in ("ix_contracts_rouming_id", "ix_contracts_didox_id", "ix_contracts_customer_inn", "ix_contracts_customer_name", "ix_contracts_customer_request_id"):
        op.drop_index(op.f(index), table_name="contracts")
    for name in (
        "parse_warnings", "parse_confidence", "parser_version", "parsed_text_path", "original_filename",
        "source_file_path", "rouming_id", "didox_id", "executor_phone", "executor_mfo",
        "executor_bank_name", "executor_bank_account", "executor_legal_address", "executor_oked",
        "executor_inn", "executor_director_full_name", "executor_name", "customer_phone",
        "customer_mfo", "customer_bank_name", "customer_bank_account", "customer_legal_address",
        "customer_oked", "customer_inn", "customer_director_full_name", "customer_name",
        "place", "customer_request_id",
    ):
        op.drop_column("contracts", name)
