import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, Enum, Float, Integer, Boolean, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CapabilityStatus(str, enum.Enum):
    critical = "critical"
    attention = "attention"
    proficient = "proficient"
    advanced = "advanced"


class TrendDirection(str, enum.Enum):
    improving = "improving"
    stable = "stable"
    declining = "declining"


class Category(Base):
    __tablename__ = "programs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    objective: Mapped[str | None] = mapped_column(Text)
    target_learner: Mapped[str | None] = mapped_column(String(500))
    current_level: Mapped[float] = mapped_column(Float, default=0.0)
    target_level: Mapped[float] = mapped_column(Float, default=5.0)
    baseline_level: Mapped[float] = mapped_column(Float, default=0.0)
    time_estimate: Mapped[str | None] = mapped_column(String(100))
    insight_banner: Mapped[str | None] = mapped_column(Text)
    next_step_title: Mapped[str | None] = mapped_column(String(500))
    next_step_description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    organization = relationship("Organization")
    domains = relationship("Domain", back_populates="category", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="category", cascade="all, delete-orphan")
    focus_sessions = relationship("FocusSession", cascade="all, delete-orphan")
    courses = relationship("Course", back_populates="category")


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id"), nullable=False
    )
    domain_name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    category = relationship("Category", back_populates="domains")
    capabilities = relationship("Capability", back_populates="domain", cascade="all, delete-orphan")


class Capability(Base):
    __tablename__ = "capabilities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("domains.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    current_level: Mapped[float] = mapped_column(Float, default=0.0)
    target_level: Mapped[float] = mapped_column(Float, default=5.0)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="attention")
    trend: Mapped[str] = mapped_column(String(50), default="stable")
    recommendation: Mapped[str | None] = mapped_column(Text)
    is_focus_skill: Mapped[bool] = mapped_column(Boolean, default=False)

    domain = relationship("Domain", back_populates="capabilities")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    category = relationship("Category", back_populates="milestones")


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    related_skill: Mapped[str | None] = mapped_column(String(500))
    difficulty: Mapped[str] = mapped_column(String(100), default="Intermediate")
    duration: Mapped[str] = mapped_column(String(100), default="30 min")
    category: Mapped[str | None] = mapped_column(String(500))
