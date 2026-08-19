"""audit log: who performed which action

Revision ID: 20260819_0032
Revises: 20260814_0031
Create Date: 2026-08-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260819_0032"
down_revision = "20260814_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=150), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("module", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(length=64), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_log_id"), "audit_log", ["id"], unique=False)
    op.create_index(op.f("ix_audit_log_created_at"), "audit_log", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_log_user_id"), "audit_log", ["user_id"], unique=False)
    op.create_index(op.f("ix_audit_log_username"), "audit_log", ["username"], unique=False)
    op.create_index(op.f("ix_audit_log_path"), "audit_log", ["path"], unique=False)
    op.create_index(op.f("ix_audit_log_module"), "audit_log", ["module"], unique=False)
    op.create_index(op.f("ix_audit_log_action"), "audit_log", ["action"], unique=False)
    op.create_index(op.f("ix_audit_log_status_code"), "audit_log", ["status_code"], unique=False)


def downgrade() -> None:
    for name in ("status_code", "action", "module", "path", "username", "user_id", "created_at", "id"):
        op.drop_index(op.f(f"ix_audit_log_{name}"), table_name="audit_log")
    op.drop_table("audit_log")
