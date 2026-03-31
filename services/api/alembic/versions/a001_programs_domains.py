"""Add categories (programs table), domains, capabilities, milestones, focus_sessions tables.

Revision ID: a001_programs
Revises: c556189ea311
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a001_programs"
down_revision = "c556189ea311"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "programs",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("objective", sa.Text),
        sa.Column("target_learner", sa.String(500)),
        sa.Column("current_level", sa.Float, server_default="0.0"),
        sa.Column("target_level", sa.Float, server_default="5.0"),
        sa.Column("baseline_level", sa.Float, server_default="0.0"),
        sa.Column("time_estimate", sa.String(100)),
        sa.Column("insight_banner", sa.Text),
        sa.Column("next_step_title", sa.String(500)),
        sa.Column("next_step_description", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "domains",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("domain_name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    op.create_table(
        "capabilities",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("domain_id", UUID(as_uuid=True), sa.ForeignKey("domains.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("current_level", sa.Float, server_default="0.0"),
        sa.Column("target_level", sa.Float, server_default="5.0"),
        sa.Column("progress", sa.Integer, server_default="0"),
        sa.Column("status", sa.String(50), server_default="'attention'"),
        sa.Column("trend", sa.String(50), server_default="'stable'"),
        sa.Column("recommendation", sa.Text),
        sa.Column("is_focus_skill", sa.Boolean, server_default="false"),
    )

    op.create_table(
        "milestones",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("label", sa.String(500), nullable=False),
        sa.Column("completed", sa.Boolean, server_default="false"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    op.create_table(
        "focus_sessions",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("related_skill", sa.String(500)),
        sa.Column("difficulty", sa.String(100), server_default="'Intermediate'"),
        sa.Column("duration", sa.String(100), server_default="'30 min'"),
        sa.Column("category", sa.String(500)),
    )


def downgrade() -> None:
    op.drop_table("focus_sessions")
    op.drop_table("milestones")
    op.drop_table("capabilities")
    op.drop_table("domains")
    op.drop_table("programs")
