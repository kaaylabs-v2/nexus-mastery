from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from app.models.conversation import SessionType, SessionMode


class ConversationCreate(BaseModel):
    course_id: UUID
    session_type: SessionType = SessionType.guided_learning


class MessageInput(BaseModel):
    content: str


class ConversationResponse(BaseModel):
    id: UUID
    user_id: UUID
    course_id: UUID
    session_type: SessionType
    messages: list[dict] | None = None
    session_mode: SessionMode
    topics_covered: list[int] | None = None
    current_topic_id: int | None = None
    started_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}
