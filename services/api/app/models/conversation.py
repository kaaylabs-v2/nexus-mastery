import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Enum, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SessionType(str, enum.Enum):
    assessment = "assessment"
    guided_learning = "guided_learning"
    practice = "practice"
    mastery_verification = "mastery_verification"


class SessionMode(str, enum.Enum):
    assess = "assess"
    teach = "teach"
    check_understanding = "check_understanding"
    challenge = "challenge"
    apply = "apply"
    reflect = "reflect"


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False
    )
    session_type: Mapped[SessionType] = mapped_column(
        Enum(SessionType), default=SessionType.guided_learning
    )
    messages: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
    topics_covered: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
    current_topic_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    session_mode: Mapped[str] = mapped_column(
        String(50), default="assess"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user = relationship("User", back_populates="conversations")
    course = relationship("Course", back_populates="conversations")
