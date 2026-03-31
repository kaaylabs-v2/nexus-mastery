from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.organization import Organization, PlanTier
from app.schemas.user import UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


class SignupRequest(BaseModel):
    org_name: str
    admin_name: str
    admin_email: str
    auth0_sub: str


@router.post("/signup")
async def signup(
    data: SignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new org + first admin user. Called after Auth0 signup."""
    slug = data.org_name.lower().replace(" ", "-").replace(".", "").replace("'", "")

    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Organization name already taken")

    existing_user = await db.execute(select(User).where(User.email == data.admin_email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(400, "User with this email already exists")

    org = Organization(
        name=data.org_name,
        slug=slug,
        plan_tier=PlanTier.starter,
        settings={"branding": {"primary_color": "#0D9488"}},
    )
    db.add(org)
    await db.flush()

    admin = User(
        email=data.admin_email,
        display_name=data.admin_name,
        role=UserRole.org_admin,
        org_id=org.id,
        auth0_sub=data.auth0_sub,
    )
    db.add(admin)
    await db.commit()

    return {
        "org_id": str(org.id),
        "user_id": str(admin.id),
        "org_name": org.name,
        "role": "org_admin",
    }
