from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from app.models.course import CourseType, CourseStatus, CourseCategory


class CourseBase(BaseModel):
    title: str
    description: str | None = None
    type: CourseType = CourseType.preloaded
    status: CourseStatus = CourseStatus.draft


class CourseCreate(CourseBase):
    org_id: UUID
    mastery_criteria: dict | None = None
    content_index: str | None = None


class CourseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    type: CourseType | None = None
    status: CourseStatus | None = None
    course_category: CourseCategory | None = None
    mastery_criteria: dict | None = None
    content_index: str | None = None


class CourseResponse(CourseBase):
    id: UUID
    org_id: UUID
    course_category: CourseCategory = CourseCategory.general
    mastery_criteria: dict | None = None
    content_index: str | None = None
    course_outline: list[dict] | None = None
    thumbnail_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
