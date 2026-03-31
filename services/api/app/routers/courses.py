import asyncio
from uuid import UUID
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_current_org_id
from app.models.course import Course, CourseStatus
from app.models.user import User
from app.models.enrollment import Enrollment
from app.schemas.course import CourseCreate, CourseUpdate, CourseResponse
from app.services.quiz_generator import generate_quiz, score_quiz
from app.services.thumbnail_service import generate_course_thumbnail

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course).where(Course.org_id == org_id)
    )
    return result.scalars().all()


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_in: CourseCreate,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value not in ("org_admin", "facilitator"):
        raise HTTPException(status_code=403, detail="Only admins and facilitators can create courses")
    data = course_in.model_dump(exclude={"org_id"})
    course = Course(org_id=org_id, **data)
    db.add(course)
    await db.flush()
    await db.commit()
    await db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == org_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: UUID,
    course_in: CourseUpdate,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value not in ("org_admin", "facilitator"):
        raise HTTPException(status_code=403, detail="Only admins and facilitators can update courses")
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == org_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    update_data = course_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(course, field, value)

    await db.flush()
    await db.commit()
    await db.refresh(course)
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if user.role.value != "org_admin":
        raise HTTPException(status_code=403, detail="Only admins can delete courses")
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == org_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.delete(course)
    await db.commit()


@router.get("/{course_id}/outline")
async def get_course_outline(
    course_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"outline": course.course_outline or [], "title": course.title}


@router.get("/me/enrolled", response_model=list[CourseResponse])
async def list_my_courses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Courses the learner is enrolled in."""
    result = await db.execute(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user.id, Course.status == CourseStatus.active)
    )
    return result.scalars().all()


@router.get("/me/available", response_model=list[CourseResponse])
async def list_available_courses(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Published courses not yet enrolled in."""
    enrolled_ids = select(Enrollment.course_id).where(Enrollment.user_id == user.id)
    result = await db.execute(
        select(Course).where(
            Course.org_id == org_id,
            Course.status == CourseStatus.active,
            Course.id.not_in(enrolled_ids),
        )
    )
    return result.scalars().all()


# ── Quiz Endpoints ────────────────────────────────────────────────────────────

@router.get("/{course_id}/quiz")
async def get_placement_quiz(
    course_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a placement quiz for a course to assess the learner's starting level."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    metadata = course.ai_generated_metadata or {}
    quiz = await generate_quiz(
        course_title=course.title,
        course_description=course.description,
        topics=metadata.get("topics"),
        course_outline=course.course_outline,
    )
    return quiz


class QuizSubmission(BaseModel):
    answers: dict[str, str]  # question_id -> selected option id
    questions: list[dict]    # the full questions array (with correct_answer)


@router.post("/{course_id}/quiz/submit")
async def submit_quiz(
    course_id: UUID,
    submission: QuizSubmission,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Score a completed placement quiz and return the learner's assessed level."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    scoring = score_quiz(submission.questions, submission.answers)
    return scoring


# ── Thumbnail Generation ──────────────────────────────────────────────────────

@router.post("/{course_id}/generate-thumbnail")
async def generate_thumbnail(
    course_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI thumbnail for a course using DALL-E 3."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    url = await generate_course_thumbnail(
        title=course.title,
        description=course.description,
        category=course.course_category.value if course.course_category else "general",
    )
    if not url:
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")

    course.thumbnail_url = url
    flag_modified(course, "thumbnail_url")
    await db.commit()
    await db.refresh(course)
    return {"thumbnail_url": url}


@router.post("/generate-all-thumbnails")
async def generate_all_thumbnails(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate thumbnails for all courses that don't have one yet."""
    if user.role.value not in ("org_admin", "facilitator"):
        raise HTTPException(status_code=403, detail="Only admins can bulk-generate thumbnails")

    result = await db.execute(
        select(Course).where(
            Course.org_id == org_id,
            Course.thumbnail_url.is_(None),
        )
    )
    courses = result.scalars().all()

    generated = {}
    for course in courses:
        url = await generate_course_thumbnail(
            title=course.title,
            description=course.description,
            category=course.course_category.value if course.course_category else "general",
        )
        if url:
            course.thumbnail_url = url
            flag_modified(course, "thumbnail_url")
            generated[str(course.id)] = url

    await db.commit()
    return {"generated": len(generated), "courses": generated}
