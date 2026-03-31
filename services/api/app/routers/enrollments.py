"""Enrollment endpoints — learner self-enroll + admin enroll."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_current_org_id
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, MasteryStatus
from app.models.mastery_profile import MasteryProfile

router = APIRouter(prefix="/api/enrollments", tags=["enrollments"])


class EnrollRequest(BaseModel):
    course_id: UUID


class AdminEnrollRequest(BaseModel):
    user_id: UUID
    course_id: UUID


class BulkEnrollRequest(BaseModel):
    user_ids: list[UUID]
    course_id: UUID


async def _ensure_mastery_profile(user_id: UUID, db: AsyncSession):
    """Create mastery profile if learner doesn't have one yet."""
    result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        db.add(MasteryProfile(
            user_id=user_id,
            thinking_patterns={},
            knowledge_graph={},
            pacing_preferences={"optimal_session_length": 25},
            course_progress={},
        ))


async def _create_enrollment(user_id: UUID, course_id: UUID, org_id: UUID, db: AsyncSession) -> Enrollment:
    """Create enrollment with validation."""
    # Check course exists and is published
    course_result = await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == org_id)
    )
    course = course_result.scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.status != CourseStatus.active:
        raise HTTPException(400, "Cannot enroll in an unpublished course")

    # Check not already enrolled
    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user_id,
            Enrollment.course_id == course_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Already enrolled in this course")

    # Create enrollment
    enrollment = Enrollment(
        user_id=user_id,
        course_id=course_id,
        mastery_status=MasteryStatus.not_started,
    )
    db.add(enrollment)

    # Auto-create mastery profile
    await _ensure_mastery_profile(user_id, db)

    await db.flush()
    await db.refresh(enrollment)
    return enrollment


@router.post("")
async def self_enroll(
    data: EnrollRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Learner self-enrolls in a published course."""
    enrollment = await _create_enrollment(user.id, data.course_id, org_id, db)
    return {
        "id": str(enrollment.id),
        "course_id": str(enrollment.course_id),
        "mastery_status": enrollment.mastery_status.value,
    }


@router.delete("/{enrollment_id}", status_code=204)
async def unenroll(
    enrollment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Learner un-enrolls."""
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.id == enrollment_id,
            Enrollment.user_id == user.id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    await db.delete(enrollment)
    await db.commit()


@router.post("/admin")
async def admin_enroll(
    data: AdminEnrollRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin enrolls a user in a course."""
    if user.role != UserRole.org_admin:
        raise HTTPException(403, "Admin role required")
    enrollment = await _create_enrollment(data.user_id, data.course_id, org_id, db)
    return {
        "id": str(enrollment.id),
        "user_id": str(enrollment.user_id),
        "course_id": str(enrollment.course_id),
    }


@router.post("/admin/bulk")
async def admin_bulk_enroll(
    data: BulkEnrollRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin enrolls multiple users at once."""
    if user.role != UserRole.org_admin:
        raise HTTPException(403, "Admin role required")

    results = []
    for uid in data.user_ids:
        try:
            enrollment = await _create_enrollment(uid, data.course_id, org_id, db)
            results.append({"user_id": str(uid), "status": "enrolled"})
        except HTTPException as e:
            results.append({"user_id": str(uid), "status": "failed", "error": e.detail})

    return {"results": results, "enrolled": sum(1 for r in results if r["status"] == "enrolled")}
