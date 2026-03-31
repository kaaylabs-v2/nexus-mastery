from uuid import UUID
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.mastery_profile import MasteryProfile
from app.models.enrollment import Enrollment
from app.models.conversation import Conversation
from app.models.course import Course
from app.schemas.mastery import (
    MasteryProfileResponse,
    EnrollmentStatusResponse,
    AnalyticsResponse,
    OverallAnalytics,
    GrowthDatapoint,
    ByCourseAnalytics,
)

router = APIRouter(prefix="/api/mastery", tags=["mastery"])


@router.get("/me/profile", response_model=MasteryProfileResponse)
async def get_my_mastery_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Learner reads their own mastery profile."""
    result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Mastery profile not found")
    return profile


@router.get("/{user_id}/profile", response_model=MasteryProfileResponse)
async def get_user_mastery_profile(
    user_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific user's mastery profile.
    PRIVACY: Only the learner themselves can access their full mastery profile.
    Org admins are explicitly DENIED access.
    """
    if user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: mastery profiles are private to the learner",
        )

    result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Mastery profile not found")
    return profile


@router.get("/enrollments/me", response_model=list[EnrollmentStatusResponse])
async def get_my_enrollments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id)
    )
    return result.scalars().all()


@router.get("/enrollments/org", response_model=list[EnrollmentStatusResponse])
async def get_org_enrollments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Org admin can see enrollment statuses (not mastery profiles)."""
    if user.role != UserRole.org_admin:
        raise HTTPException(status_code=403, detail="Only admins can view org enrollments")

    result = await db.execute(
        select(Enrollment)
        .join(User, Enrollment.user_id == User.id)
        .where(User.org_id == user.org_id)
    )
    return result.scalars().all()


@router.get("/enrollments/org/count")
async def get_org_enrollment_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Org admin can see enrollment counts."""
    if user.role != UserRole.org_admin:
        raise HTTPException(status_code=403, detail="Only admins can view org stats")

    result = await db.execute(
        select(func.count(Enrollment.id))
        .join(User, Enrollment.user_id == User.id)
        .where(User.org_id == user.org_id)
    )
    count = result.scalar()
    return {"count": count}


@router.get("/analytics/me", response_model=AnalyticsResponse)
async def get_analytics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics data for the current learner."""
    # Fetch all conversations for the user
    conv_result = await db.execute(
        select(Conversation).where(Conversation.user_id == user.id)
    )
    conversations = conv_result.scalars().all()

    # Fetch all enrollments for the user with course data
    enroll_result = await db.execute(
        select(Enrollment)
        .join(Course, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user.id)
    )
    enrollments = enroll_result.scalars().all()

    # Fetch all courses that the user is enrolled in
    course_result = await db.execute(
        select(Course).where(
            Course.id.in_(
                select(Enrollment.course_id).where(Enrollment.user_id == user.id)
            )
        )
    )
    courses = course_result.scalars().all()
    courses_by_id = {c.id: c for c in courses}

    # Calculate overall stats
    total_sessions = len(conversations)
    total_messages = sum(
        len(conv.messages) if conv.messages else 0 for conv in conversations
    )
    courses_enrolled = len(enrollments)
    courses_completed = sum(
        1
        for enroll in enrollments
        if enroll.mastery_status.value == "mastery_achieved"
    )

    # Calculate current streak (consecutive days from today backward with at least one session)
    current_streak_days = 0
    if conversations:
        today = datetime.now(timezone.utc).date()
        current_date = today

        # Group conversations by date
        conv_by_date = {}
        for conv in conversations:
            conv_date = conv.started_at.date()
            conv_by_date[conv_date] = True

        # Count backward from today
        while current_date in conv_by_date:
            current_streak_days += 1
            current_date -= timedelta(days=1)

    # Calculate growth (group by date)
    growth_data = {}
    for conv in conversations:
        conv_date = conv.started_at.date()
        if conv_date not in growth_data:
            growth_data[conv_date] = {"sessions": 0, "messages": 0}
        growth_data[conv_date]["sessions"] += 1
        growth_data[conv_date]["messages"] += len(conv.messages) if conv.messages else 0

    growth = [
        GrowthDatapoint(date=date, **counts)
        for date, counts in sorted(growth_data.items())
    ]

    # Calculate per-course analytics
    by_course = []
    conversations_by_course = {}
    for conv in conversations:
        if conv.course_id not in conversations_by_course:
            conversations_by_course[conv.course_id] = []
        conversations_by_course[conv.course_id].append(conv)

    for enrollment in enrollments:
        course = courses_by_id.get(enrollment.course_id)
        course_conversations = conversations_by_course.get(enrollment.course_id, [])

        sessions_completed = len(course_conversations)
        total_course_messages = sum(
            len(conv.messages) if conv.messages else 0 for conv in course_conversations
        )

        # Count unique topics covered
        topics_covered_set = set()
        for conv in course_conversations:
            if conv.topics_covered:
                topics_covered_set.update(conv.topics_covered)
        topics_covered = len(topics_covered_set)

        # Get total topics from course outline
        total_topics = 0
        if course and course.course_outline:
            total_topics = len(course.course_outline)

        # Get last session and current mode
        last_session_at = None
        current_mode = None
        if course_conversations:
            latest_conv = max(
                course_conversations, key=lambda c: c.started_at
            )
            last_session_at = latest_conv.started_at
            current_mode = latest_conv.session_mode

        by_course.append(
            ByCourseAnalytics(
                course_id=enrollment.course_id,
                course_title=course.title if course else "Unknown Course",
                sessions_completed=sessions_completed,
                total_messages=total_course_messages,
                topics_covered=topics_covered,
                total_topics=total_topics,
                current_mode=current_mode,
                last_session_at=last_session_at,
                mastery_status=enrollment.mastery_status,
            )
        )

    overall = OverallAnalytics(
        total_sessions=total_sessions,
        total_messages=total_messages,
        courses_enrolled=courses_enrolled,
        courses_completed=courses_completed,
        current_streak_days=current_streak_days,
    )

    # Build learner insights from mastery profile
    learner_insights = None
    profile_result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile:
        insights = {}

        # Thinking patterns
        tp = profile.thinking_patterns or {}
        if tp.get("reasoning_style") or tp.get("strengths") or tp.get("gaps"):
            insights["reasoning_style"] = tp.get("reasoning_style", "")
            insights["strengths"] = tp.get("strengths", [])
            insights["gaps"] = tp.get("gaps", [])

        # Knowledge graph
        kg = profile.knowledge_graph or {}
        if kg.get("demonstrated") or kg.get("struggling") or kg.get("connections_made"):
            insights["concepts_mastered"] = kg.get("demonstrated", [])
            insights["concepts_struggling"] = kg.get("struggling", [])
            insights["connections_made"] = kg.get("connections_made", [])

        # Pacing preferences
        pp = profile.pacing_preferences or {}
        if pp:
            insights["pacing"] = pp

        # Session summaries
        if profile.conversation_summary:
            insights["recent_sessions"] = profile.conversation_summary[-5:]  # Last 5

        if insights:
            learner_insights = insights

    return AnalyticsResponse(
        overall=overall,
        growth=growth,
        by_course=by_course,
        learner_insights=learner_insights,
    )
