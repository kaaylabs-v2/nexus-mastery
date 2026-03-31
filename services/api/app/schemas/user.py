from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    display_name: str | None = None
    role: UserRole = UserRole.learner


class UserCreate(UserBase):
    org_id: UUID
    auth0_sub: str


class UserResponse(UserBase):
    id: UUID
    org_id: UUID
    auth0_sub: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
