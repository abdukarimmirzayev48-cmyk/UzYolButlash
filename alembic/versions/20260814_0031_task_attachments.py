"""ijro: multi-file attachments on tasks and comments

Revision ID: 20260814_0031
Revises: 20260812_0030
Create Date: 2026-08-14

One table serves both places: comment_id is null for files attached to the task
itself (brief, specs) and set for files posted with a comment.

Existing TaskComment.attachment_url values are copied across so nothing is
lost; the old column is kept (unused by the app) so a downgrade can still find
them, and because dropping it would rewrite the whole table on SQLite for no
practical gain.
"""

import os
from urllib.parse import unquote

from alembic import op
import sqlalchemy as sa


revision = "20260814_0031"
down_revision = "20260812_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=False),
        sa.Column("file_url", sa.String(length=500), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["comment_id"], ["task_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_task_attachments_id"), "task_attachments", ["id"], unique=False)
    op.create_index(op.f("ix_task_attachments_task_id"), "task_attachments", ["task_id"], unique=False)
    op.create_index(op.f("ix_task_attachments_comment_id"), "task_attachments", ["comment_id"], unique=False)

    # Carry over the single attachment each comment could previously hold.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, task_id, author_user_id, attachment_url, created_at FROM task_comments "
            "WHERE attachment_url IS NOT NULL AND attachment_url != ''"
        )
    ).fetchall()
    for comment_id, task_id, author_id, url, created_at in rows:
        bind.execute(
            sa.text(
                "INSERT INTO task_attachments "
                "(task_id, comment_id, uploaded_by_user_id, file_url, file_name, created_at) "
                "VALUES (:task_id, :comment_id, :user_id, :url, :name, :created_at)"
            ),
            {
                "task_id": task_id,
                "comment_id": comment_id,
                "user_id": author_id,
                "url": url,
                # Stored names look like "<uuid-hex>_<original name>".
                "name": unquote(os.path.basename(url)).split("_", 1)[-1] or "fayl",
                "created_at": created_at,
            },
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_task_attachments_comment_id"), table_name="task_attachments")
    op.drop_index(op.f("ix_task_attachments_task_id"), table_name="task_attachments")
    op.drop_index(op.f("ix_task_attachments_id"), table_name="task_attachments")
    op.drop_table("task_attachments")
