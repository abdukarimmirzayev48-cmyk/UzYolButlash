"""Region and district reference tables

Revision ID: 20260819_0035
Revises: 20260819_0034
Create Date: 2026-08-19

Regions are seeded with the fourteen names already present in client_addresses,
character for character, so every existing address keeps matching after the
form switches from free text to a dropdown.

Districts are created empty on purpose -- see backend/app/models/geo.py for why
the addresses in this database are not a usable source for that list.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260819_0035"
down_revision = "20260819_0034"
branch_labels = None
depends_on = None

# Taken verbatim from the distinct regions in client_addresses, ordered the way
# the country's own listings order them: the republic, the provinces, then the
# capital.
REGIONS = [
    "Қорақалпоғистон Республикаси",
    "Андижон вилояти",
    "Бухоро вилояти",
    "Жиззах вилояти",
    "Қашқадарё вилояти",
    "Навоий вилояти",
    "Наманган вилояти",
    "Самарқанд вилояти",
    "Сурхондарё вилояти",
    "Сирдарё вилояти",
    "Тошкент вилояти",
    "Фарғона вилояти",
    "Хоразм вилояти",
    "Тошкент шаҳри",
]


def upgrade() -> None:
    op.create_table(
        "regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", name="uq_region_name"),
    )
    op.create_index("ix_regions_name", "regions", ["name"])
    op.create_table(
        "districts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("region_id", sa.Integer(), sa.ForeignKey("regions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("region_id", "name", name="uq_district_region_name"),
    )
    op.create_index("ix_districts_region_id", "districts", ["region_id"])

    now = sa.func.datetime("now", "localtime")
    op.execute(
        sa.text(
            "INSERT INTO regions (name, sort_order, created_at, updated_at) VALUES "
            + ", ".join(f"(:n{i}, {i}, datetime('now','localtime'), datetime('now','localtime'))" for i in range(len(REGIONS)))
        ).bindparams(**{f"n{i}": name for i, name in enumerate(REGIONS)})
    )


def downgrade() -> None:
    op.drop_index("ix_districts_region_id", table_name="districts")
    op.drop_table("districts")
    op.drop_index("ix_regions_name", table_name="regions")
    op.drop_table("regions")
