"""Add notebook_entries and vocabulary_entries tables

Revision ID: a004_notebook_vocabulary
Revises: a003_course_thumbnail_url
Create Date: 2026-04-02 23:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "a004_notebook_vocabulary"
down_revision = "a003_course_thumbnail_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notebook_entries",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("source", sa.String(50), server_default="personal"),
        sa.Column("source_message_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_notebook_entries_user_id", "notebook_entries", ["user_id"])
    op.create_index("ix_notebook_entries_course_id", "notebook_entries", ["course_id"])

    op.create_table(
        "vocabulary_entries",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("term", sa.String(500), nullable=False),
        sa.Column("definition", sa.Text, nullable=False),
        sa.Column("example", sa.Text, nullable=True),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_vocabulary_entries_user_id", "vocabulary_entries", ["user_id"])
    op.create_index("ix_vocabulary_entries_course_id", "vocabulary_entries", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_vocabulary_entries_course_id")
    op.drop_index("ix_vocabulary_entries_user_id")
    op.drop_table("vocabulary_entries")
    op.drop_index("ix_notebook_entries_course_id")
    op.drop_index("ix_notebook_entries_user_id")
    op.drop_table("notebook_entries")
