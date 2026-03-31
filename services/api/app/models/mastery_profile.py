import uuid
from datetime import datetime, timezone
from sqlalchemy import ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class MasteryProfile(Base):
    __tablename__ = "mastery_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    thinking_patterns: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
    knowledge_graph: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
    pacing_preferences: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
    course_progress: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
    conversation_summary: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="mastery_profile")
