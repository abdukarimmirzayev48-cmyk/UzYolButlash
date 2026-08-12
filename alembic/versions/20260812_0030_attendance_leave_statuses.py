"""attendance: excused-late and leave statuses

Revision ID: 20260812_0030
Revises: 20260807_0029
Create Date: 2026-08-12

Widens attendance_records.status to carry the excused/leave categories from the
company's paper timesheet: late_excused (сабабли), study_leave (ўқув таътили),
labor_leave (меҳнат таътилида), unpaid_leave (Бс), sick_leave (Бл) and
business_trip (Хс). The existing `late` value keeps its meaning -- unexcused
lateness (сабабсиз) -- so no data migration is needed.

On SQLite this is schema hygiene rather than a functional change: the column is
a plain VARCHAR with no CHECK constraint, so longer values already store fine.
It keeps the DB in agreement with the model and is required on Postgres.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260812_0030"
down_revision = "20260807_0029"
branch_labels = None
depends_on = None

NEW_STATUSES = (
    "on_time", "late", "late_excused", "absent", "study_leave", "labor_leave",
    "unpaid_leave", "sick_leave", "business_trip", "day_off", "no_data",
)
OLD_STATUSES = ("on_time", "late", "absent", "day_off", "no_data")


def upgrade() -> None:
    with op.batch_alter_table("attendance_records") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.Enum(*OLD_STATUSES, name="attendancestatus"),
            type_=sa.Enum(*NEW_STATUSES, name="attendancestatus"),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Any record carrying one of the new statuses has no equivalent in the old
    # set; map leave/excused days to the closest old meaning before narrowing.
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE attendance_records SET status = 'late' WHERE status = 'late_excused'"))
    bind.execute(
        sa.text(
            "UPDATE attendance_records SET status = 'day_off' "
            "WHERE status IN ('study_leave', 'labor_leave', 'unpaid_leave', 'sick_leave', 'business_trip')"
        )
    )
    with op.batch_alter_table("attendance_records") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.Enum(*NEW_STATUSES, name="attendancestatus"),
            type_=sa.Enum(*OLD_STATUSES, name="attendancestatus"),
            existing_nullable=False,
        )
