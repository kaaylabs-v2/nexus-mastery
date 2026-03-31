import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, Enum, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CourseType(str, enum.Enum):
    preloaded = "preloaded"
    custom = "custom"
    commissioned = "commissioned"


class CourseCategory(str, enum.Enum):
    """Inferred from course content — determines session layout and tooling."""
    coding = "coding"              # IDE panel, code runner, syntax highlighting
    business = "business"          # Case study workspace, strategy canvas
    science = "science"            # Equations, simulations, visualization lab
    creative = "creative"          # Visual canvas, design tools, media
    general = "general"            # Default layout — thinking scaffold only


class SourceType(str, enum.Enum):
    manual = "manual"
    uploaded = "uploaded"


class CourseStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[CourseType] = mapped_column(Enum(CourseType), default=CourseType.preloaded)
    mastery_criteria: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
    content_index: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[CourseStatus] = mapped_column(
        Enum(CourseStatus), default=CourseStatus.draft
    )
    course_category: Mapped[CourseCategory] = mapped_column(
        Enum(CourseCategory), default=CourseCategory.general
    )
    source_type: Mapped[str] = mapped_column(
        String(50), default="manual"
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id"), nullable=True
    )
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    ai_generated_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    course_outline: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc)
    )

    organization = relationship("Organization", back_populates="courses")
    category = relationship("Category", back_populates="courses")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="course", cascade="all, delete-orphan")
    content_embeddings = relationship("ContentEmbedding", back_populates="course", cascade="all, delete-orphan")
