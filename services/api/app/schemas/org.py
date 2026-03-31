from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from app.models.organization import PlanTier


class OrgBase(BaseModel):
    name: str
    slug: str
    plan_tier: PlanTier = PlanTier.starter


class OrgCreate(OrgBase):
    settings: dict | None = None


class OrgUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    plan_tier: PlanTier | None = None
    settings: dict | None = None


class OrgResponse(OrgBase):
    id: UUID
    settings: dict | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
