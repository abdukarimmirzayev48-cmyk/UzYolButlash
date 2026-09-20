"""Xodim obyektivkasi

Revision ID: 20260921_0073
Revises: 20260911_0072
Create Date: 2026-09-21

Kadrlar obyektivkani qog'ozda yuritardi. Xodim kartochkasida esa faqat
ism, lavozim va tabel raqami bor edi -- «tug'ilgan yili qachon», «qaysi
oliygohni tamomlagan» degan savollarga tizim javob bera olmasdi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260921_0073"
down_revision = "20260911_0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employee_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        # Bitta xodimga bitta obyektivka: ikkinchisi ochilsa, qaysi biri
        # haqiqiy ekani noma'lum bo'lib qolardi.
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("birth_place", sa.String(255), nullable=True),
        sa.Column("nationality", sa.String(128), nullable=True),
        sa.Column("party", sa.String(128), nullable=True),
        sa.Column("education_level", sa.String(128), nullable=True),
        sa.Column("education_institution", sa.String(255), nullable=True),
        sa.Column("education_graduated_year", sa.String(32), nullable=True),
        sa.Column("speciality", sa.String(255), nullable=True),
        sa.Column("academic_degree", sa.String(128), nullable=True),
        sa.Column("academic_title", sa.String(128), nullable=True),
        sa.Column("languages", sa.String(255), nullable=True),
        sa.Column("state_awards", sa.Text(), nullable=True),
        sa.Column("deputy_status", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("passport", sa.String(64), nullable=True),
        sa.Column("pinfl", sa.String(32), nullable=True),
        sa.Column("marital_status", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["attendance_employees.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("employee_id", name="uq_employee_profiles_employee_id"),
    )
    op.create_index("ix_employee_profiles_employee_id", "employee_profiles", ["employee_id"])
    op.create_index("ix_employee_profiles_pinfl", "employee_profiles", ["pinfl"])

    op.create_table(
        "employee_career_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        # Sana matn: blankada «2015 -- 2019» yoki «2020 yildan hozirgacha»
        # deb yoziladi, aniq kun har doim ma'lum bo'lmaydi.
        sa.Column("period", sa.String(128), nullable=False),
        sa.Column("organization", sa.String(255), nullable=True),
        sa.Column("position", sa.String(255), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["profile_id"], ["employee_profiles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employee_career_entries_profile_id", "employee_career_entries", ["profile_id"])


def downgrade() -> None:
    op.drop_table("employee_career_entries")
    op.drop_table("employee_profiles")
