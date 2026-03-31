from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class CapabilityResponse(BaseModel):
    id: UUID
    name: str
    current_level: float
    target_level: float
    progress: int
    status: str
    trend: str
    recommendation: str | None = None
    is_focus_skill: bool = False

    model_config = {"from_attributes": True}


class DomainResponse(BaseModel):
    id: UUID
    domain_name: str
    capabilities: list[CapabilityResponse] = []

    model_config = {"from_attributes": True}


class MilestoneResponse(BaseModel):
    id: UUID
    label: str
    completed: bool

    model_config = {"from_attributes": True}


class FocusSessionResponse(BaseModel):
    id: UUID
    title: str
    related_skill: str | None = None
    difficulty: str
    duration: str
    category: str | None = None

    model_config = {"from_attributes": True}


class FocusSkillResponse(BaseModel):
    id: UUID
    name: str
    current_level: float
    target_level: float
    progress: int
    status: str
    trend: str
    domain: str
    recommendation: str | None = None


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    objective: str | None = None
    target_learner: str | None = None
    current_level: float
    target_level: float
    baseline_level: float
    time_estimate: str | None = None
    insight_banner: str | None = None
    next_step_title: str | None = None
    next_step_description: str | None = None
    domains: list[DomainResponse] = []
    milestones: list[MilestoneResponse] = []
    focus_sessions: list[FocusSessionResponse] = []
    focus_skills: list[FocusSkillResponse] = []
    strengths: list[dict] = []
    focus_areas: list[dict] = []
    courses: list[dict] = []

    model_config = {"from_attributes": True}


class CategoryCreateRequest(BaseModel):
    name: str
    objective: str | None = None
    target_learner: str | None = None
    current_level: float = 0.0
    target_level: float = 5.0
    baseline_level: float = 0.0
    time_estimate: str | None = None
    insight_banner: str | None = None
    next_step_title: str | None = None
    next_step_description: str | None = None


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    objective: str | None = None
    target_learner: str | None = None
    current_level: float | None = None
    target_level: float | None = None
    time_estimate: str | None = None
    insight_banner: str | None = None
    next_step_title: str | None = None
    next_step_description: str | None = None


class DomainCreateRequest(BaseModel):
    domain_name: str
    capabilities: list[dict] = []  # [{name, current_level, target_level, progress, status, trend, recommendation, is_focus_skill}]


class ScenarioCreateRequest(BaseModel):
    title: str
    related_skill: str | None = None
    difficulty: str = "Intermediate"
    duration: str = "30 min"
    category: str | None = None


class CategoryListResponse(BaseModel):
    id: UUID
    name: str
    current_level: float
    target_level: float

    model_config = {"from_attributes": True}
