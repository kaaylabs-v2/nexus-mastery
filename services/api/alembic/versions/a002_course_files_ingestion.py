"""Add course_files, ingestion_jobs tables and new Course columns.

Revision ID: a002_admin
Revises: a001_programs
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision = "a002_admin"
down_revision = "a001_programs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New Course columns
    op.add_column("courses", sa.Column("source_type", sa.String(50), server_default="'manual'"))
    op.add_column("courses", sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("programs.id"), nullable=True))
    op.add_column("courses", sa.Column("ai_generated_metadata", JSONB, nullable=True))
    op.add_column("courses", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))

    # CourseFile table
    op.create_table(
        "course_files",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("upload_status", sa.String(50), server_default="'pending'"),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # IngestionJob table
    op.create_table(
        "ingestion_jobs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="'queued'"),
        sa.Column("progress_pct", sa.Integer, server_default="0"),
        sa.Column("current_step", sa.String(255), nullable=True),
        sa.Column("chunks_total", sa.Integer, nullable=True),
        sa.Column("chunks_processed", sa.Integer, server_default="0"),
        sa.Column("ai_generated_metadata", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("file_ids", ARRAY(UUID(as_uuid=True)), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ingestion_jobs")
    op.drop_table("course_files")
    op.drop_column("courses", "published_at")
    op.drop_column("courses", "ai_generated_metadata")
    op.drop_column("courses", "program_id")
    op.drop_column("courses", "source_type")
