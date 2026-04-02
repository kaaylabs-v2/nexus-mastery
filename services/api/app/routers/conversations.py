import json
import re
import asyncio
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, async_session
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.conversation import Conversation
from app.models.course import Course
from app.schemas.conversation import ConversationCreate, ConversationResponse, MessageInput
from app.services.nexi_engine import generate_socratic_response
from app.services.mastery_service import get_mastery_profile, update_mastery_profile
from app.services.rag_pipeline import retrieve_relevant
from app.services.session_assessment import assess_session
from app.services.response_evaluator import evaluate_response, assess_learner_level
from app.models.enrollment import Enrollment, MasteryStatus

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

# Guard against duplicate session_start (React Strict Mode sends connect twice)
_greeting_in_progress: set[str] = set()

# Session mode progression: assess first, then teach through reflect
MODE_ORDER = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"]

SCAFFOLD_PROMPTS = {
    "assess": {
        "observation": "Nexi is getting to know what you already know about this topic.",
        "consider": [
            "What do you already know about this subject?",
            "Have you had any experience with this in practice?",
        ],
    },
    "teach": {
        "observation": "Nexi is explaining the concept. Follow along and ask questions if anything is unclear.",
        "consider": [
            "What's the key idea being explained?",
            "How does this connect to what you already know?",
        ],
    },
    "check_understanding": {
        "observation": "Time to check your understanding. Try to explain the concept in your own words.",
        "consider": [
            "Can you summarize the main point?",
            "What's a real-world example of this?",
        ],
    },
    "challenge": {
        "observation": "Nexi is pushing your thinking deeper. Consider edge cases and counterarguments.",
        "consider": [
            "What assumptions are you making?",
            "What would happen if the situation were different?",
        ],
    },
    "apply": {
        "observation": "Time to apply what you've learned to a realistic scenario.",
        "consider": [
            "What's your first instinct? Why?",
            "What information do you need to make a good decision?",
        ],
    },
    "reflect": {
        "observation": "Reflect on what you've learned. What will you take away from this session?",
        "consider": [
            "What's the most important thing you learned?",
            "What would you do differently next time?",
        ],
    },
}


def _determine_mode_fallback(
    messages: list[dict],
    topics_covered: list[int] | None = None,
    total_topics: int = 0,
) -> str:
    """Fallback: progress through session modes based on topic coverage or exchange count."""
    if topics_covered is not None and total_topics > 0:
        progress = len(topics_covered) / total_topics
        if progress < 0.3:
            return "teach"
        elif progress < 0.5:
            return "check_understanding"
        elif progress < 0.7:
            return "challenge"
        elif progress < 0.9:
            return "apply"
        return "reflect"

    exchanges = sum(1 for m in messages if m.get("role") == "user")
    if exchanges <= 3:
        return "teach"
    elif exchanges <= 5:
        return "check_understanding"
    elif exchanges <= 8:
        return "challenge"
    elif exchanges <= 11:
        return "apply"
    return "reflect"


def _get_adaptive_mode(messages: list[dict]) -> str | None:
    """Get the stored next_mode from the most recent evaluation in the messages.
    Returns None if no adaptive mode has been stored yet.
    Validates against MODE_ORDER to prevent invalid modes from propagating.
    """
    for msg in reversed(messages):
        mode = msg.get("_next_mode")
        if mode and mode in MODE_ORDER:
            return mode
    return None


def _count_exchanges_in_mode(messages: list[dict], mode: str) -> int:
    """Count how many user exchanges have happened in the current mode.

    Walks backwards through messages. A mode boundary is detected when an
    assistant message's _next_mode differs from the current mode AND is
    followed by a user message (i.e. the user responded in a different mode).
    This prevents counting user messages from the previous mode.
    """
    count = 0
    found_boundary = False
    for msg in reversed(messages):
        # An assistant message whose _next_mode transitioned INTO the current
        # mode marks the boundary — count user messages AFTER this point only.
        if msg.get("role") == "assistant":
            stored = msg.get("_next_mode")
            if stored and stored != mode:
                found_boundary = True
                break
        if msg.get("role") == "user":
            count += 1
    return count


def _detect_topic_transition(
    full_response: str,
    course_outline: list[dict] | None,
    current_topic_id: int | None,
    topics_covered: list[int],
) -> tuple[int | None, list[int]]:
    """Detect if Nexi's response indicates a topic transition.

    Uses multiple heuristics:
    1. Transition phrases ("let's move on", "next up", etc.)
    2. Next topic title mentioned (partial match — first 2-3 significant words)
    3. ANY future topic title mentioned (Nexi might skip ahead)
    4. Current topic explicitly wrapped up ("you've got X", "that covers X")
    """
    if not course_outline or not current_topic_id:
        return current_topic_id, topics_covered

    current_idx = next(
        (i for i, s in enumerate(course_outline) if s["id"] == current_topic_id), None
    )
    if current_idx is None:
        return current_topic_id, topics_covered

    response_lower = full_response.lower()

    # Last topic — check for session wrap-up
    next_idx = current_idx + 1
    if next_idx >= len(course_outline):
        if current_topic_id not in topics_covered:
            wrap_phrases = ["covered everything", "that wraps up", "we've gone through",
                          "session complete", "that's all", "we've covered all"]
            if any(p in response_lower for p in wrap_phrases):
                return current_topic_id, list(topics_covered) + [current_topic_id]
        return current_topic_id, topics_covered

    # General transition phrases
    transition_phrases = [
        "let's move on", "let's move to", "let us move", "next up",
        "now let's talk about", "now let us talk",
        "moving on to", "let's dive into", "let us dive into",
        "that brings us to", "now that you understand",
        "great, you've got", "you've got a solid", "you have a solid",
        "next topic", "let's look at", "let us look at",
        "let's explore", "let us explore", "let's get into", "let us get into",
        "let's go", "shall we move", "ready to move", "time to move",
        "now let's", "now let us", "let's shift", "on to the next",
        "moving forward", "let's turn to", "let's tackle", "here's the next",
    ]

    has_transition_phrase = any(phrase in response_lower for phrase in transition_phrases)

    def _title_matches(title: str) -> bool:
        """Check if a topic title is mentioned in the response using flexible matching."""
        title_lower = title.lower()
        # Remove common filler words for matching
        skip_words = {"and", "the", "of", "for", "in", "to", "a", "an", "with", "from", "by"}
        significant_words = [w for w in title_lower.split() if w not in skip_words and len(w) > 2]

        if not significant_words:
            return False

        # Check if first 2 significant words appear together
        if len(significant_words) >= 2:
            fragment = f"{significant_words[0]} {significant_words[1]}"
            if fragment in response_lower:
                return True

        # Check if first significant word appears near a transition phrase
        if has_transition_phrase and significant_words[0] in response_lower:
            return True

        # Check for the full title (minus the subtitle after colon/dash)
        main_title = title_lower.split(":")[0].split("—")[0].strip()
        if len(main_title) > 8 and main_title in response_lower:
            return True

        return False

    # Check next topic first (most common case)
    next_section = course_outline[next_idx]
    if _title_matches(next_section.get("title", "")):
        if current_topic_id not in topics_covered:
            topics_covered = list(topics_covered) + [current_topic_id]
        return next_section["id"], topics_covered

    # If there's a transition phrase, check ALL future topics (Nexi might skip)
    if has_transition_phrase:
        for future_idx in range(next_idx, min(next_idx + 3, len(course_outline))):
            future_section = course_outline[future_idx]
            if _title_matches(future_section.get("title", "")):
                # Mark all skipped topics as covered
                new_covered = list(topics_covered)
                for skip_idx in range(current_idx, future_idx):
                    skip_id = course_outline[skip_idx]["id"]
                    if skip_id not in new_covered:
                        new_covered.append(skip_id)
                return future_section["id"], new_covered

        # Transition phrase but no specific topic mentioned — advance to next
        if current_topic_id not in topics_covered:
            topics_covered = list(topics_covered) + [current_topic_id]
        return next_section["id"], topics_covered

    return current_topic_id, topics_covered


def _extract_visuals_from_response(response: str) -> tuple[str, list[dict]]:
    """Extract [VISUAL:...] blocks from Nexi's response."""
    visuals = []
    pattern = r'\[VISUAL:(mermaid|table)(?:\|([^\]]*))?\]\s*(.*?)\s*\[/VISUAL\]'
    matches = re.findall(pattern, response, re.DOTALL)

    for visual_type, title, content in matches:
        if visual_type == "mermaid":
            visuals.append({
                "type": "mermaid",
                "title": title.strip() if title else "Diagram",
                "content": content.strip(),
            })
        elif visual_type == "table":
            lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
            if len(lines) >= 2:
                headers = [h.strip() for h in lines[0].split("|")]
                rows = [[c.strip() for c in row.split("|")] for row in lines[1:]]
                visuals.append({
                    "type": "table",
                    "title": title.strip() if title else "Comparison",
                    "headers": headers,
                    "rows": rows,
                })

    cleaned = re.sub(pattern, '', response, flags=re.DOTALL).strip()
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned, visuals


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    conv_in: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for an existing active (non-ended) session for this course
    existing = await db.execute(
        select(Conversation).where(
            Conversation.user_id == user.id,
            Conversation.course_id == conv_in.course_id,
            Conversation.ended_at.is_(None),
        ).order_by(Conversation.started_at.desc()).limit(1)
    )
    active_session = existing.scalar_one_or_none()
    if active_session and active_session.messages and len(active_session.messages) > 0:
        # Reuse existing active session instead of creating a duplicate
        return active_session

    conversation = Conversation(
        user_id=user.id,
        course_id=conv_in.course_id,
        session_type=conv_in.session_type,
        messages=[],
        topics_covered=[],
        current_topic_id=1,
        session_mode="assess",
    )
    db.add(conversation)
    await db.flush()
    await db.refresh(conversation)
    return conversation


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(Conversation.user_id == user.id)
    )
    return result.scalars().all()


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.post("/{conversation_id}/messages", response_model=ConversationResponse)
async def add_message(
    conversation_id: UUID,
    message: MessageInput,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = list(conversation.messages or [])
    messages.append({
        "role": "user",
        "content": message.content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    conversation.messages = messages
    flag_modified(conversation, "messages")
    await db.flush()
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.post("/{conversation_id}/complete")
async def complete_conversation(
    conversation_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark conversation as complete and trigger mastery assessment."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.ended_at = datetime.now(timezone.utc)

    # Get mastery profile for assessment context
    profile = await get_mastery_profile(user.id, db)
    profile_dict = None
    if profile:
        profile_dict = {
            "thinking_patterns": profile.thinking_patterns,
            "knowledge_graph": profile.knowledge_graph,
        }

    # Collect accumulated learner insights from per-exchange evaluations
    learner_insights = []
    for msg in (conversation.messages or []):
        eval_data = msg.get("_evaluation", {})
        if eval_data.get("learner_insight"):
            learner_insights.append(eval_data["learner_insight"])

    # Run assessment
    try:
        assessment = await assess_session(
            conversation.messages or [],
            profile_dict,
            None,
            learner_insights=learner_insights,
        )
    except Exception as e:
        return {"status": "completed", "assessment_error": str(e)}

    # Update mastery profile
    if profile:
        existing_tp = profile.thinking_patterns or {}
        existing_tp.update(assessment.get("thinking_patterns_update", {}))
        profile.thinking_patterns = existing_tp

        existing_kg = profile.knowledge_graph or {}
        existing_kg.update(assessment.get("knowledge_graph_update", {}))
        profile.knowledge_graph = existing_kg

        summaries = profile.conversation_summary or []
        summaries.append({
            "conversation_id": str(conversation_id),
            "summary": assessment.get("session_summary", ""),
            "date": datetime.now(timezone.utc).isoformat(),
        })
        profile.conversation_summary = summaries

    # Update enrollment status
    enrollment_result = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == conversation.course_id,
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if enrollment and enrollment.mastery_status == MasteryStatus.not_started:
        enrollment.mastery_status = MasteryStatus.in_progress

    await db.commit()
    return {"status": "completed", "assessment": assessment}


@router.websocket("/{conversation_id}/stream")
async def conversation_stream(
    websocket: WebSocket,
    conversation_id: UUID,
):
    await websocket.accept()

    import logging
    logger = logging.getLogger(__name__)

    async def _load_course_and_chunks(conversation, user_content, messages, current_topic_id=None):
        """Load course info, outline, and RAG chunks."""
        course_title = None
        course_description = None
        course_outline = None
        course_chunks = []

        async with async_session() as db_course:
            course = (await db_course.execute(
                select(Course).where(Course.id == conversation.course_id)
            )).scalar_one_or_none()
            if course:
                course_title = course.title
                course_description = course.description
                course_outline = course.course_outline

        try:
            async with async_session() as db_rag:
                if course_outline and current_topic_id:
                    current_section = next(
                        (s for s in course_outline if s["id"] == current_topic_id), None
                    )
                    if current_section:
                        rag_query = (
                            f"{current_section['title']} "
                            f"{current_section.get('description', '')} "
                            f"{' '.join(current_section.get('key_concepts', []))}"
                        )
                    else:
                        rag_query = f"{course_title} {course_description or ''}"
                elif len(messages) <= 1 and course_title:
                    rag_query = f"introduction overview fundamentals {course_title} {course_description or ''}"
                else:
                    rag_query = f"{course_title} {user_content}" if course_title else user_content

                course_chunks = await retrieve_relevant(
                    rag_query, conversation.course_id, db_rag, top_k=5
                )
        except Exception:
            pass

        if not course_chunks and course_title:
            course_chunks = [f"Course: {course_title}\nDescription: {course_description or ''}"]

        return course_title, course_chunks, course_outline

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "")

            # ── SESSION START: Nexi greets (ASSESS mode or post-quiz mode) ──
            if msg_type == "session_start":
                conv_key = str(conversation_id)
                if conv_key in _greeting_in_progress:
                    continue
                _greeting_in_progress.add(conv_key)
                try:  # ensure _greeting_in_progress is always cleaned up
                    # Check for quiz result — if learner took the placement quiz,
                    # skip assess mode and start at teach/challenge with calibrated depth
                    quiz_result = message.get("quiz_result")
                    if quiz_result:
                        start_mode = quiz_result.get("skip_to_mode", "teach")
                        if start_mode not in MODE_ORDER:
                            start_mode = "teach"
                        teach_depth = quiz_result.get("teach_depth", "foundational")
                        familiarity = quiz_result.get("familiarity", "basic")
                        quiz_pct = quiz_result.get("percentage", 0)
                    else:
                        start_mode = "assess"
                        teach_depth = None
                        familiarity = None
                        quiz_pct = None

                    async with async_session() as db:
                        conversation = (await db.execute(
                            select(Conversation).where(Conversation.id == conversation_id)
                        )).scalar_one_or_none()

                        if not conversation:
                            logger.warning(f"session_start: conversation {conversation_id} not found")
                            await websocket.send_json({"type": "error", "content": "Session not found. Please go back and try again."})
                            continue

                        # If conversation already has messages, send them back instead of re-greeting
                        if conversation.messages:
                            logger.info(f"session_start: conversation {conversation_id} already has {len(conversation.messages)} messages — sending existing state")
                            # Send outline if available
                            course_title, course_chunks, course_outline = await _load_course_and_chunks(
                                conversation, "", [], current_topic_id=conversation.current_topic_id or 1
                            )
                            if course_outline:
                                await websocket.send_json({
                                    "type": "outline_update",
                                    "outline": course_outline,
                                    "current_topic_id": conversation.current_topic_id or 1,
                                    "topics_covered": conversation.topics_covered or [],
                                })
                            mode = conversation.session_mode or "assess"
                            mode_idx = MODE_ORDER.index(mode) if mode in MODE_ORDER else 0
                            scaffold_mode = mode if mode in SCAFFOLD_PROMPTS else "teach"
                            await websocket.send_json({
                                "type": "scaffold_update",
                                "mode": mode,
                                "next_mode": mode,
                                "mode_index": mode_idx,
                                "observation": SCAFFOLD_PROMPTS[scaffold_mode]["observation"],
                                "consider": SCAFFOLD_PROMPTS[scaffold_mode]["consider"],
                            })
                            continue

                        # Initialize topic tracking
                        conversation.current_topic_id = 1
                        conversation.topics_covered = []
                        conversation.session_mode = start_mode

                        course_title, course_chunks, course_outline = await _load_course_and_chunks(
                            conversation, "", [], current_topic_id=1
                        )

                        profile = await get_mastery_profile(conversation.user_id, db)
                        profile_dict = {"thinking_patterns": profile.thinking_patterns, "knowledge_graph": profile.knowledge_graph, "pacing_preferences": profile.pacing_preferences} if profile else None

                        # If quiz provided calibration, inject it into profile
                        if teach_depth and profile_dict:
                            profile_dict["quiz_calibration"] = {
                                "teach_depth": teach_depth,
                                "familiarity": familiarity,
                                "quiz_percentage": quiz_pct,
                            }

                        full_response = ""
                        try:
                            async for token in generate_socratic_response(
                                conversation_history=[], mastery_profile=profile_dict,
                                course_chunks=course_chunks, session_mode=start_mode,
                                course_title=course_title,
                                course_outline=course_outline,
                                current_topic_id=1,
                                topics_covered=[],
                                teach_depth=teach_depth,
                            ):
                                full_response += token
                                await websocket.send_json({"type": "assistant_token", "content": token})
                        except Exception as e:
                            logger.error(f"Greeting generation failed: {e}", exc_info=True)
                            await websocket.send_json({"type": "error", "content": f"Nexi had trouble starting: {str(e)}"})
                            continue

                        cleaned_response, inline_visuals = _extract_visuals_from_response(full_response)

                        conversation.messages = [{"role": "assistant", "content": cleaned_response, "timestamp": datetime.now(timezone.utc).isoformat()}]
                        flag_modified(conversation, "messages")
                        flag_modified(conversation, "topics_covered")
                        await db.commit()

                        await websocket.send_json({"type": "assistant_complete", "content": cleaned_response})

                        for visual in inline_visuals:
                            await websocket.send_json({"type": "inline_visual", "visual_type": visual.get("type"), **{k: v for k, v in visual.items() if k != "type"}})

                        if course_outline:
                            first_section = next((s for s in course_outline if s["id"] == 1), None)
                            if first_section and first_section.get("visuals"):
                                for visual in first_section["visuals"]:
                                    await websocket.send_json({"type": "topic_visual", "visual_type": visual.get("type"), **{k: v for k, v in visual.items() if k != "type"}})

                        if course_outline:
                            await websocket.send_json({
                                "type": "outline_update",
                                "outline": course_outline,
                                "current_topic_id": 1,
                                "topics_covered": [],
                            })

                        mode_idx = MODE_ORDER.index(start_mode) if start_mode in MODE_ORDER else 0
                        scaffold_mode = start_mode if start_mode in SCAFFOLD_PROMPTS else "teach"
                        await websocket.send_json({
                            "type": "scaffold_update",
                            "mode": start_mode,
                            "next_mode": start_mode,
                            "mode_index": mode_idx,
                            "observation": SCAFFOLD_PROMPTS[scaffold_mode]["observation"],
                            "consider": SCAFFOLD_PROMPTS[scaffold_mode]["consider"],
                        })
                        logger.info(f"Session started in {start_mode.upper()} mode for {conversation_id}: {len(full_response)} chars (quiz={quiz_result is not None})")
                finally:
                    _greeting_in_progress.discard(conv_key)
                continue

            # ── USER MESSAGE: Process, respond, and adaptively evaluate ──
            if msg_type == "user_message":
                user_content = message.get("content", "").strip()
                if not user_content:
                    continue

                await websocket.send_json({"type": "message_received", "content": user_content})

                async with async_session() as db:
                    conversation = (await db.execute(
                        select(Conversation).where(Conversation.id == conversation_id)
                    )).scalar_one_or_none()

                    if not conversation:
                        await websocket.send_json({"type": "error", "content": "Conversation not found"})
                        continue

                    # Append and SAVE user message immediately
                    messages = list(conversation.messages or [])
                    messages.append({"role": "user", "content": user_content, "timestamp": datetime.now(timezone.utc).isoformat()})
                    conversation.messages = messages
                    flag_modified(conversation, "messages")
                    await db.commit()
                    logger.info(f"User message saved: {user_content[:50]}...")

                    # Get current topic tracking
                    current_topic_id = conversation.current_topic_id or 1
                    topics_covered = list(conversation.topics_covered or [])

                    # Load course + RAG
                    course_title, course_chunks, course_outline = await _load_course_and_chunks(
                        conversation, user_content, messages,
                        current_topic_id=current_topic_id
                    )

                    # Determine session mode — adaptive first, fallback second
                    stored_mode = _get_adaptive_mode(messages)
                    if stored_mode:
                        session_mode = stored_mode
                    else:
                        session_mode = conversation.session_mode or "assess"

                    await websocket.send_json({"type": "mode_update", "mode": session_mode})

                    # Load profile
                    profile = await get_mastery_profile(conversation.user_id, db)
                    profile_dict = {"thinking_patterns": profile.thinking_patterns, "knowledge_graph": profile.knowledge_graph, "pacing_preferences": profile.pacing_preferences} if profile else None

                    # Stream Nexi response
                    full_response = ""
                    try:
                        async for token in generate_socratic_response(
                            conversation_history=messages, mastery_profile=profile_dict,
                            course_chunks=course_chunks, session_mode=session_mode,
                            session_type=conversation.session_type or "guided_learning",
                            course_title=course_title,
                            course_outline=course_outline,
                            current_topic_id=current_topic_id,
                            topics_covered=topics_covered,
                        ):
                            full_response += token
                            await websocket.send_json({"type": "assistant_token", "content": token})
                    except Exception as e:
                        logger.error(f"AI generation failed: {e}", exc_info=True)
                        await websocket.send_json({"type": "error", "content": f"Nexi had trouble responding: {str(e)}"})
                        continue

                    # Extract inline visuals
                    cleaned_response, inline_visuals = _extract_visuals_from_response(full_response)
                    await websocket.send_json({"type": "assistant_complete", "content": cleaned_response})

                    for visual in inline_visuals:
                        await websocket.send_json({"type": "inline_visual", "visual_type": visual.get("type"), **{k: v for k, v in visual.items() if k != "type"}})

                    # ── ADAPTIVE EVALUATION (runs in parallel with topic detection) ──
                    total_exchanges = sum(1 for m in messages if m.get("role") == "user")
                    exchanges_in_mode = _count_exchanges_in_mode(messages, session_mode)

                    async def _run_evaluation():
                        """Run Haiku evaluation to determine next mode."""
                        try:
                            if session_mode == "assess":
                                result = await assess_learner_level(
                                    learner_response=user_content,
                                    course_topic=course_title or "",
                                    mastery_profile=profile_dict,
                                )
                                return {
                                    "is_assess": True,
                                    "next_mode": result.get("skip_to_mode", "teach"),
                                    "teach_depth": result.get("teach_depth", "foundational"),
                                    "familiarity": result.get("familiarity", "none"),
                                    "decision": "advance",
                                    "reason": result.get("reason", ""),
                                    "learner_insight": result.get("learner_insight", ""),
                                }
                            else:
                                result = await evaluate_response(
                                    current_mode=session_mode,
                                    nexi_message=cleaned_response,
                                    learner_response=user_content,
                                    mastery_profile=profile_dict,
                                    exchanges_in_current_mode=exchanges_in_mode,
                                    total_exchanges=total_exchanges,
                                )
                                return {
                                    "is_assess": False,
                                    "next_mode": result.get("next_mode", session_mode),
                                    "comprehension": result.get("comprehension"),
                                    "reasoning_quality": result.get("reasoning_quality"),
                                    "engagement": result.get("engagement"),
                                    "decision": result.get("decision", "stay"),
                                    "reason": result.get("reason", ""),
                                    "learner_insight": result.get("learner_insight", ""),
                                }
                        except Exception as e:
                            logger.error(f"Evaluation failed: {e}", exc_info=True)
                            # Fallback — include all fields so downstream .get() calls are consistent
                            if session_mode == "assess":
                                return {
                                    "is_assess": True, "next_mode": "teach",
                                    "teach_depth": "foundational", "familiarity": "none",
                                    "decision": "advance", "reason": "Evaluation unavailable",
                                    "learner_insight": "",
                                }
                            return {
                                "is_assess": False, "next_mode": session_mode,
                                "comprehension": None, "reasoning_quality": None,
                                "engagement": None, "decision": "stay",
                                "reason": "Evaluation unavailable", "learner_insight": "",
                            }

                    # Run evaluation and topic detection in parallel
                    eval_result, (new_topic_id, new_topics_covered) = await asyncio.gather(
                        _run_evaluation(),
                        asyncio.to_thread(
                            _detect_topic_transition,
                            cleaned_response, course_outline, current_topic_id, topics_covered,
                        ),
                    )

                    next_mode = eval_result["next_mode"]

                    # If topic changed, send pre-generated visuals
                    if course_outline and new_topic_id != current_topic_id:
                        new_section = next((s for s in course_outline if s["id"] == new_topic_id), None)
                        if new_section and new_section.get("visuals"):
                            for visual in new_section["visuals"]:
                                await websocket.send_json({"type": "topic_visual", "visual_type": visual.get("type"), **{k: v for k, v in visual.items() if k != "type"}})

                    # Update conversation tracking
                    conversation.current_topic_id = new_topic_id
                    conversation.topics_covered = new_topics_covered
                    conversation.session_mode = next_mode
                    flag_modified(conversation, "topics_covered")

                    # Send scaffold update with evaluation data
                    scaffold = SCAFFOLD_PROMPTS.get(next_mode, SCAFFOLD_PROMPTS["teach"])
                    mode_index = MODE_ORDER.index(next_mode) if next_mode in MODE_ORDER else 0
                    await websocket.send_json({
                        "type": "scaffold_update",
                        "mode": session_mode,
                        "next_mode": next_mode,
                        "mode_index": mode_index,
                        "observation": scaffold["observation"],
                        "consider": scaffold["consider"],
                        "evaluation": {
                            "comprehension": eval_result.get("comprehension"),
                            "reasoning_quality": eval_result.get("reasoning_quality"),
                            "decision": eval_result.get("decision"),
                            "reason": eval_result.get("reason"),
                        },
                    })

                    # Send outline progress
                    if course_outline:
                        await websocket.send_json({
                            "type": "outline_update",
                            "outline": course_outline,
                            "current_topic_id": new_topic_id,
                            "topics_covered": new_topics_covered,
                        })

                    # Persist assistant response with evaluation metadata
                    messages = list(conversation.messages or [])
                    msg_record = {
                        "role": "assistant",
                        "content": cleaned_response,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "_next_mode": next_mode,
                        "_evaluation": {
                            "comprehension": eval_result.get("comprehension"),
                            "reasoning_quality": eval_result.get("reasoning_quality"),
                            "decision": eval_result.get("decision"),
                            "learner_insight": eval_result.get("learner_insight"),
                        },
                    }

                    # Store teach_depth from assess phase
                    if eval_result.get("is_assess"):
                        msg_record["_teach_depth"] = eval_result.get("teach_depth", "foundational")
                        msg_record["_familiarity"] = eval_result.get("familiarity")

                    messages.append(msg_record)
                    conversation.messages = messages
                    flag_modified(conversation, "messages")
                    await db.commit()
                    logger.info(f"Nexi responded: {len(full_response)} chars, mode={session_mode}→{next_mode}, decision={eval_result.get('decision')}, topic={new_topic_id}, covered={new_topics_covered}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {conversation_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {conversation_id}: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
            await websocket.close()
        except Exception:
            pass
