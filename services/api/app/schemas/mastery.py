from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, date
from app.models.enrollment import MasteryStatus


class MasteryProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    thinking_patterns: dict | None = None
    knowledge_graph: dict | None = None
    pacing_preferences: dict | None = None
    course_progress: dict | None = None
    conversation_summary: dict | list | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class EnrollmentStatusResponse(BaseModel):
    id: UUID
    user_id: UUID
    course_id: UUID
    mastery_status: MasteryStatus
    enrolled_at: datetime
    mastery_achieved_at: datetime | None = None

    model_config = {"from_attributes": True}


class GrowthDatapoint(BaseModel):
    date: date
    sessions: int
    messages: int


class ByCourseAnalytics(BaseModel):
    course_id: UUID
    course_title: str
    sessions_completed: int
    total_messages: int
    topics_covered: int
    total_topics: int
    current_mode: str | None
    last_session_at: datetime | None
    mastery_status: MasteryStatus


class OverallAnalytics(BaseModel):
    total_sessions: int
    total_messages: int
    courses_enrolled: int
    courses_completed: int
    current_streak_days: int


class AnalyticsResponse(BaseModel):
    overall: OverallAnalytics
    growth: list[GrowthDatapoint]
    by_course: list[ByCourseAnalytics]
    learner_insights: dict | None = None
