"""ijro workflow overhaul: multi-assignee tasks, status lifecycle, comments, history, notifications

Revision ID: 20260803_0027
Revises: 20260803_0026
Create Date: 2026-08-03

Expands the Ijro (task) module from a single-assignee flat-status list into a
real workflow: multiple assignees per task (task_assignees), an enforced
new -> accepted -> in_progress -> done -> verified/rejected lifecycle, a
comment thread with optional attachments (task_comments, replacing the old
single free-text `note` column), a full audit trail (task_history, starts
empty -- no historical data exists to backfill), and in-app notifications
(notifications, also starts empty). Also links attendance_employees to a
login user (user_id) so workflow actions can be gated to the actual assignee.

Existing task.status values are remapped (pending -> new, cancelled ->
rejected; in_progress/done unchanged). Existing single assigned_employee_id
values are copied into task_assignees before the column is dropped. Existing
non-null `note` values are copied into task_comments, authored by the first
admin user found -- there's no way to know who historically wrote a note, so
this is the best available default (same fallback approach used for the
department backfill in 20260731_0022).
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20260803_0027"
down_revision = "20260803_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_assignees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["attendance_employees.id"]),
        sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "employee_id", name="uq_task_assignee"),
    )
    op.create_index(op.f("ix_task_assignees_id"), "task_assignees", ["id"], unique=False)
    op.create_index(op.f("ix_task_assignees_task_id"), "task_assignees", ["task_id"], unique=False)
    op.create_index(op.f("ix_task_assignees_employee_id"), "task_assignees", ["employee_id"], unique=False)

    op.create_table(
        "task_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("attachment_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_task_comments_id"), "task_comments", ["id"], unique=False)
    op.create_index(op.f("ix_task_comments_task_id"), "task_comments", ["task_id"], unique=False)

    op.create_table(
        "task_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.String(length=255), nullable=True),
        sa.Column("new_value", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_task_history_id"), "task_history", ["id"], unique=False)
    op.create_index(op.f("ix_task_history_task_id"), "task_history", ["task_id"], unique=False)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_id"), "notifications", ["id"], unique=False)
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)
    op.create_index(op.f("ix_notifications_task_id"), "notifications", ["task_id"], unique=False)
    op.create_index(op.f("ix_notifications_created_at"), "notifications", ["created_at"], unique=False)

    # --- attendance_employees.user_id: bridge to a login user ---
    op.add_column("attendance_employees", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_attendance_employees_user_id"), "attendance_employees", ["user_id"], unique=True)
    with op.batch_alter_table("attendance_employees") as batch_op:
        batch_op.create_foreign_key("fk_attendance_employees_user_id", "users", ["user_id"], ["id"])

    # --- tasks: new columns ---
    op.add_column("tasks", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("department_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("closed_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_tasks_created_by_user_id"), "tasks", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_tasks_department_id"), "tasks", ["department_id"], unique=False)

    bind = op.get_bind()
    now = datetime.utcnow()

    # Backfill task_assignees from the old single assigned_employee_id (harmless no-op if tasks is empty).
    bind.execute(
        sa.text("INSERT INTO task_assignees (task_id, employee_id, created_at) SELECT id, assigned_employee_id, :now FROM tasks"),
        {"now": now},
    )

    # Backfill created_by_user_id + task_comments (from `note`) against the first admin user, if one exists.
    admin_id = bind.execute(sa.text("SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1")).scalar()
    if admin_id is not None:
        bind.execute(sa.text("UPDATE tasks SET created_by_user_id = :admin_id"), {"admin_id": admin_id})
        bind.execute(
            sa.text(
                "INSERT INTO task_comments (task_id, author_user_id, text, created_at) "
                "SELECT id, :admin_id, note, :now FROM tasks WHERE note IS NOT NULL AND note != ''"
            ),
            {"admin_id": admin_id, "now": now},
        )

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.alter_column("created_by_user_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key("fk_tasks_created_by_user_id", "users", ["created_by_user_id"], ["id"])
        batch_op.create_foreign_key("fk_tasks_department_id", "departments", ["department_id"], ["id"])

    # --- tasks: status remap ---
    bind.execute(sa.text("UPDATE tasks SET status = 'new' WHERE status = 'pending'"))
    bind.execute(sa.text("UPDATE tasks SET status = 'rejected' WHERE status = 'cancelled'"))

    # --- tasks: drop columns superseded by task_assignees / task_comments ---
    op.drop_index(op.f("ix_tasks_assigned_employee_id"), table_name="tasks")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("assigned_employee_id")
        batch_op.drop_column("note")


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("assigned_employee_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("note", sa.Text(), nullable=True))
    op.create_index(op.f("ix_tasks_assigned_employee_id"), "tasks", ["assigned_employee_id"], unique=False)

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE tasks SET assigned_employee_id = ("
            "SELECT employee_id FROM task_assignees WHERE task_assignees.task_id = tasks.id LIMIT 1"
            ")"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE tasks SET note = ("
            "SELECT text FROM task_comments WHERE task_comments.task_id = tasks.id ORDER BY created_at LIMIT 1"
            ")"
        )
    )
    bind.execute(sa.text("UPDATE tasks SET status = 'pending' WHERE status IN ('new', 'accepted')"))
    bind.execute(sa.text("UPDATE tasks SET status = 'cancelled' WHERE status IN ('rejected', 'verified')"))

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_created_by_user_id", type_="foreignkey")
        batch_op.drop_constraint("fk_tasks_department_id", type_="foreignkey")
        batch_op.alter_column("assigned_employee_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index(op.f("ix_tasks_department_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_created_by_user_id"), table_name="tasks")
    op.drop_column("tasks", "closed_at")
    op.drop_column("tasks", "department_id")
    op.drop_column("tasks", "created_by_user_id")

    with op.batch_alter_table("attendance_employees") as batch_op:
        batch_op.drop_constraint("fk_attendance_employees_user_id", type_="foreignkey")
    op.drop_index(op.f("ix_attendance_employees_user_id"), table_name="attendance_employees")
    op.drop_column("attendance_employees", "user_id")

    op.drop_index(op.f("ix_notifications_created_at"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_task_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_id"), table_name="notifications")
    op.drop_table("notifications")

    op.drop_index(op.f("ix_task_history_task_id"), table_name="task_history")
    op.drop_index(op.f("ix_task_history_id"), table_name="task_history")
    op.drop_table("task_history")

    op.drop_index(op.f("ix_task_comments_task_id"), table_name="task_comments")
    op.drop_index(op.f("ix_task_comments_id"), table_name="task_comments")
    op.drop_table("task_comments")

    op.drop_index(op.f("ix_task_assignees_employee_id"), table_name="task_assignees")
    op.drop_index(op.f("ix_task_assignees_task_id"), table_name="task_assignees")
    op.drop_index(op.f("ix_task_assignees_id"), table_name="task_assignees")
    op.drop_table("task_assignees")
