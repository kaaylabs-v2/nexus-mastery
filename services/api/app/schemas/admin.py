from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


# ─── Course Files ─────────────────────────────────────────────────────────────

class CourseFileResponse(BaseModel):
    id: UUID
    course_id: UUID | None = None
    original_filename: str
    file_type: str
    file_size: int
    upload_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    files: list[CourseFileResponse]


# ─── Ingestion ────────────────────────────────────────────────────────────────

class GenerateCourseRequest(BaseModel):
    file_ids: list[UUID]


class IngestionJobResponse(BaseModel):
    id: UUID
    course_id: UUID | None = None
    status: str
    progress_pct: int
    current_step: str | None = None
    chunks_total: int | None = None
    chunks_processed: int = 0
    ai_generated_metadata: dict | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


# ─── Users ────────────────────────────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: UUID
    display_name: str | None = None
    email: str
    role: str
    enrolled_courses_count: int = 0
    created_at: datetime


class InviteUserRequest(BaseModel):
    email: str
    role: str = "learner"


class BulkImportRow(BaseModel):
    name: str
    email: str
    role: str = "learner"
    valid: bool = True
    error: str | None = None


class BulkImportResponse(BaseModel):
    total: int
    valid_count: int
    valid: list[BulkImportRow]
    errors: list[BulkImportRow]


# ─── Analytics ────────────────────────────────────────────────────────────────

class TopCategory(BaseModel):
    name: str
    enrolled: int
    avg_progress: float


class RecentActivity(BaseModel):
    user: str
    action: str
    detail: str
    time: str


class AnalyticsOverviewResponse(BaseModel):
    total_learners: int
    active_learners: int
    total_categories: int
    avg_completion_rate: float
    weekly_sessions: list[dict] = []
    level_distribution: list[dict] = []
    top_categories: list[TopCategory] = []
    recent_activity: list[RecentActivity] = []


class CourseAnalyticsResponse(BaseModel):
    name: str
    enrolled: int
    active: int
    avg_completion: float


# ─── Settings ─────────────────────────────────────────────────────────────────

class UpdateOrgSettingsRequest(BaseModel):
    name: str | None = None
    branding: dict | None = None
    settings: dict | None = None
