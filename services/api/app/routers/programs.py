from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload, load_only
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_current_org_id
from app.models.user import User
from app.models.program import Category, Domain, Capability, Milestone, FocusSession
from app.middleware.auth import require_role
from app.schemas.program import (
    CategoryResponse, CategoryListResponse, FocusSkillResponse,
    CategoryCreateRequest, CategoryUpdateRequest, DomainCreateRequest, ScenarioCreateRequest,
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _build_category_response(category: Category) -> dict:
    """Build the full category response with computed focus_skills, strengths, and focus_areas."""
    # Collect all capabilities across domains
    all_caps = []
    for domain in category.domains:
        for cap in domain.capabilities:
            all_caps.append((cap, domain.domain_name))

    # Focus skills: capabilities flagged as focus
    focus_skills = [
        FocusSkillResponse(
            id=cap.id,
            name=cap.name,
            current_level=cap.current_level,
            target_level=cap.target_level,
            progress=cap.progress,
            status=str(cap.status),
            trend=str(cap.trend),
            domain=domain_name,
            recommendation=cap.recommendation,
        )
        for cap, domain_name in all_caps
        if cap.is_focus_skill
    ]

    # Strengths: top 3 by progress
    sorted_caps = sorted(all_caps, key=lambda x: x[0].progress, reverse=True)
    strengths = [
        {"name": cap.name, "progress": cap.progress}
        for cap, _ in sorted_caps[:3]
        if cap.progress >= 50
    ]

    # Focus areas: caps with critical/attention status, sorted by progress ascending
    focus_areas = [
        {
            "name": cap.name,
            "progress": cap.progress,
            "gap": "Critical Gap" if str(cap.status) == "critical" else "Needs Attention",
            "detail": cap.recommendation or "",
        }
        for cap, _ in sorted(all_caps, key=lambda x: x[0].progress)
        if str(cap.status) in ("critical", "attention")
    ][:3]

    return {
        "id": category.id,
        "name": category.name,
        "objective": category.objective,
        "target_learner": category.target_learner,
        "current_level": category.current_level,
        "target_level": category.target_level,
        "baseline_level": category.baseline_level,
        "time_estimate": category.time_estimate,
        "insight_banner": category.insight_banner,
        "next_step_title": category.next_step_title,
        "next_step_description": category.next_step_description,
        "domains": category.domains,
        "milestones": category.milestones,
        "focus_sessions": category.focus_sessions,
        "focus_skills": focus_skills,
        "strengths": strengths,
        "focus_areas": focus_areas,
        "courses": [],  # Loaded separately to avoid lazy-load issues
    }


@router.get("", response_model=list[CategoryListResponse])
async def list_categories(
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category).where(Category.org_id == org_id)
    )
    return result.scalars().all()


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category)
        .where(Category.id == category_id, Category.org_id == org_id)
        .options(
            selectinload(Category.domains).selectinload(Domain.capabilities),
            selectinload(Category.milestones),
            selectinload(Category.focus_sessions),
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return _build_category_response(category)


@router.get("/active/me", response_model=CategoryResponse)
async def get_my_active_category(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Get the first active category for the current user's org."""
    result = await db.execute(
        select(Category)
        .where(Category.org_id == org_id)
        .options(
            selectinload(Category.domains).selectinload(Domain.capabilities),
            selectinload(Category.milestones),
            selectinload(Category.focus_sessions),
        )
        .limit(1)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="No active category found")
    return _build_category_response(category)


# ─── CRUD (org_admin only) ────────────────────────────────────────────────────


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(
    data: CategoryCreateRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(403, "Only admins can create categories")

    category = Category(
        org_id=org_id, name=data.name, objective=data.objective,
        target_learner=data.target_learner, current_level=data.current_level,
        target_level=data.target_level, baseline_level=data.baseline_level,
        time_estimate=data.time_estimate, insight_banner=data.insight_banner,
        next_step_title=data.next_step_title, next_step_description=data.next_step_description,
    )
    db.add(category)
    await db.flush()
    result = await db.execute(
        select(Category).where(Category.id == category.id)
        .options(selectinload(Category.domains).selectinload(Domain.capabilities),
                 selectinload(Category.milestones), selectinload(Category.focus_sessions),
)
    )
    return _build_category_response(result.scalar_one())


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID, data: CategoryUpdateRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(403, "Only admins can update categories")
    result = await db.execute(select(Category).where(Category.id == category_id, Category.org_id == org_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(404, "Category not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await db.flush()
    result = await db.execute(
        select(Category).where(Category.id == category_id)
        .options(selectinload(Category.domains).selectinload(Domain.capabilities),
                 selectinload(Category.milestones), selectinload(Category.focus_sessions),
)
    )
    return _build_category_response(result.scalar_one())


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(403, "Only admins can delete categories")
    result = await db.execute(select(Category).where(Category.id == category_id, Category.org_id == org_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(404, "Category not found")
    await db.delete(category)
    await db.commit()


@router.post("/{category_id}/domains", status_code=201)
async def add_domain(
    category_id: UUID, data: DomainCreateRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(403, "Only admins can modify categories")
    result = await db.execute(select(Category).where(Category.id == category_id, Category.org_id == org_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Category not found")
    domain = Domain(program_id=category_id, domain_name=data.domain_name)
    db.add(domain)
    await db.flush()
    await db.refresh(domain)
    for cap_data in data.capabilities:
        db.add(Capability(
            domain_id=domain.id, name=cap_data.get("name", ""),
            current_level=cap_data.get("current_level", 0), target_level=cap_data.get("target_level", 5),
            progress=cap_data.get("progress", 0), status=cap_data.get("status", "attention"),
            trend=cap_data.get("trend", "stable"), recommendation=cap_data.get("recommendation"),
            is_focus_skill=cap_data.get("is_focus_skill", False),
        ))
    await db.commit()
    return {"id": str(domain.id), "domain_name": domain.domain_name}


@router.post("/{category_id}/scenarios", status_code=201)
async def add_scenario(
    category_id: UUID, data: ScenarioCreateRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(403, "Only admins can modify categories")
    result = await db.execute(select(Category).where(Category.id == category_id, Category.org_id == org_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Category not found")
    session = FocusSession(
        program_id=category_id, title=data.title, related_skill=data.related_skill,
        difficulty=data.difficulty, duration=data.duration, category=data.category,
    )
    db.add(session)
    await db.flush()
    await db.commit()
    await db.refresh(session)
    return {"id": str(session.id), "title": session.title}
