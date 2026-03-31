from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.mastery_profile import MasteryProfile


async def get_mastery_profile(user_id: UUID, db: AsyncSession) -> MasteryProfile | None:
    result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_mastery_profile(
    user_id: UUID,
    db: AsyncSession,
    thinking_patterns: dict | None = None,
    knowledge_graph: dict | None = None,
    pacing_preferences: dict | None = None,
    course_progress: dict | None = None,
    conversation_summary: dict | None = None,
) -> MasteryProfile:
    profile = await get_mastery_profile(user_id, db)
    if not profile:
        profile = MasteryProfile(user_id=user_id)
        db.add(profile)

    if thinking_patterns is not None:
        profile.thinking_patterns = thinking_patterns
    if knowledge_graph is not None:
        profile.knowledge_graph = knowledge_graph
    if pacing_preferences is not None:
        profile.pacing_preferences = pacing_preferences
    if course_progress is not None:
        profile.course_progress = course_progress
    if conversation_summary is not None:
        profile.conversation_summary = conversation_summary

    await db.flush()
    await db.commit()
    return profile
