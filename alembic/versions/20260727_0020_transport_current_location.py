"""transport current location

Revision ID: 20260727_0020
Revises: 20260727_0019
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20260727_0020"
down_revision = "20260727_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transports", sa.Column("current_location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("transports", "current_location")
