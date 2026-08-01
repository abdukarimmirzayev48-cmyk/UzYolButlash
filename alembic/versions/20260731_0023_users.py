"""users

Revision ID: 20260731_0023
Revises: 20260731_0022
Create Date: 2026-07-31

Seeds one initial admin account (username "admin", temporary password
"ChangeMe-2026!") so there's a way to log in and create real accounts via
the Users page. Change this password immediately after first login.
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20260731_0023"
down_revision = "20260731_0022"
branch_labels = None
depends_on = None

# Pre-hashed bcrypt digest of "ChangeMe-2026!" — generated once, not derived
# at migration time, so this migration has no runtime dependency on passlib.
_SEED_ADMIN_PASSWORD_HASH = "$2b$12$XEJlNZWhuevKRenqtvFTw.6YaGhbRLatV5bAm2vlL6pOJqLSf8SbC"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("edit_modules", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)

    bind = op.get_bind()
    now = datetime.utcnow()
    bind.execute(
        sa.text(
            "INSERT INTO users (username, password_hash, full_name, is_admin, edit_modules, is_active, created_at, updated_at) "
            "VALUES (:username, :password_hash, :full_name, 1, :edit_modules, 1, :now, :now)"
        ),
        {
            "username": "admin",
            "password_hash": _SEED_ADMIN_PASSWORD_HASH,
            "full_name": "Administrator",
            "edit_modules": "[]",
            "now": now,
        },
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")
