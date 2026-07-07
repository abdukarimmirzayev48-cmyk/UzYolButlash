"""add registry fields to company and customer requests

Revision ID: 20260705_0014
Revises: 20260705_0013
Create Date: 2026-07-05
"""

from alembic import op
import sqlalchemy as sa


revision = "20260705_0014"
down_revision = "20260705_0013"
branch_labels = None
depends_on = None


NEW_COLUMNS = (
    ("region", sa.String(length=255)),
    ("activity_type", sa.Text()),
    ("function_description", sa.Text()),
    ("privatization_project_name", sa.String(length=255)),
)


def upgrade() -> None:
    for table_name in ("company_registry", "customer_requests"):
        for column_name, column_type in NEW_COLUMNS:
            op.add_column(table_name, sa.Column(column_name, column_type, nullable=True))
        op.create_index(op.f(f"ix_{table_name}_region"), table_name, ["region"], unique=False)


def downgrade() -> None:
    for table_name in ("customer_requests", "company_registry"):
        op.drop_index(op.f(f"ix_{table_name}_region"), table_name=table_name)
        for column_name, _column_type in reversed(NEW_COLUMNS):
            op.drop_column(table_name, column_name)
