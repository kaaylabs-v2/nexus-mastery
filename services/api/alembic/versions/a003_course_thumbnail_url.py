"""Add thumbnail_url to courses table.

Revision ID: a003_course_thumbnail
Revises: a002_course_files_ingestion
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = "a003_course_thumbnail"
down_revision = "a002_course_files_ingestion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("thumbnail_url", sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column("courses", "thumbnail_url")
