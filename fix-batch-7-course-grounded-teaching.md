# Batch 7: Make Nexi Actually Teach the Course Material (+ Progress Tracking)

> **PRIORITY**: CRITICAL — This is the #1 user-facing quality issue. Nexi currently drifts into generic coaching instead of teaching through the uploaded course content.
> **ESTIMATED TIME**: 2-3 hours
> **SCOPE**: Backend (`services/api`) + Frontend (`apps/web`)

---

## Problem Statement

When a user uploads "Digital Marketing Mastery" course material and starts a session, Nexi:
1. ✅ Teaches the first concept well (strategy = who + what + how)
2. ❌ Then drifts into pure Socratic questioning based on the learner's answers
3. ❌ Never references the actual course material after the first 2 messages
4. ❌ Acts like a business coach, not a course tutor
5. ❌ Has no roadmap of topics to cover
6. ❌ Shows no progress through the course material on the frontend

**Root causes:**
- RAG retrieves chunks by semantic similarity to the user's short answers ("Yes", "GOvt") — which returns random/irrelevant chunks
- There's no course outline for Nexi to follow — it has no idea what topics exist or what's next
- The `ai_generated_metadata` already contains `topics` but the teaching flow completely ignores it
- Mode progression is based on exchange count (3 messages → move to "check_understanding"), not content coverage
- The system prompt says "teach" but gives no roadmap of WHAT to teach in WHAT order

---

## Architecture Overview

The fix has 4 parts:

### Part A: Generate a Course Outline (backend)
When a course is created, use the AI-generated `topics` to create a structured teaching outline with ordered sections. Store it on the Course model.

### Part B: Track Topic Progress (backend)
Track which topics have been covered in each conversation. Use this to tell Nexi what to teach next.

### Part C: Feed the Outline to Nexi (backend)
Rewrite the system prompt and RAG strategy so Nexi follows the course outline, teaches each topic with the actual course material, and only moves on when the learner demonstrates understanding.

### Part D: Show Progress on Frontend
Display the course outline in the left panel with checkmarks showing which topics are done.

---

## Part A: Generate and Store Course Outline

### A1. Add `course_outline` field to Course model

**File**: `services/api/app/models/course.py`

Add a new JSONB column to store the ordered teaching outline:

```python
# Add after ai_generated_metadata line:
course_outline: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

The outline will be a JSON array like:
```json
[
  {
    "id": 1,
    "title": "What is Digital Marketing Strategy?",
    "description": "The three fundamental questions: who, what, and how",
    "key_concepts": ["target audience", "value proposition", "channel strategy"],
    "estimated_exchanges": 4
  },
  {
    "id": 2,
    "title": "Identifying Your Target Audience",
    "description": "Market segmentation, customer personas, and pain point analysis",
    "key_concepts": ["segmentation", "personas", "pain points", "jobs-to-be-done"],
    "estimated_exchanges": 5
  },
  ...
]
```

### A2. Create the migration

```bash
cd services/api
alembic revision --autogenerate -m "add course_outline to courses"
alembic upgrade head
```

### A3. Generate the outline during course creation

**File**: `services/api/app/services/course_generator.py`

Add a new function that generates a detailed teaching outline from the course content:

```python
OUTLINE_PROMPT = """You are a curriculum designer for an adaptive learning platform. Given course content and AI-generated metadata, create a detailed TEACHING OUTLINE.

This outline will be used by an AI tutor to systematically walk a learner through the material. Each section should:
1. Cover ONE coherent topic
2. Be teachable in 3-6 conversational exchanges
3. Build on the previous section
4. Have clear learning objectives

Return ONLY valid JSON — an array of sections in teaching order:
[
  {
    "id": 1,
    "title": "Section title — clear and specific",
    "description": "What the learner will understand after this section (1-2 sentences)",
    "key_concepts": ["concept1", "concept2", "concept3"],
    "estimated_exchanges": 4,
    "prerequisite_ids": []
  },
  ...
]

Rules:
- Create 5-12 sections depending on content depth
- First section should be foundational/introductory
- Last section should be synthesis/application
- Each section title should be specific, not generic (e.g., "Understanding Customer Acquisition Cost" not "Marketing Metrics")
- key_concepts should be 2-5 specific terms/ideas the learner needs to grasp
- estimated_exchanges is typically 3-6 (short sections keep engagement high)
"""


async def generate_course_outline(text_content: str, metadata: dict) -> list[dict]:
    """Generate a structured teaching outline from course content and metadata."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"""COURSE METADATA:
Title: {metadata.get('title', 'Unknown')}
Description: {metadata.get('description', '')}
Topics: {json.dumps(metadata.get('topics', []))}
Mastery Criteria: {json.dumps(metadata.get('mastery_criteria', []))}
Domains: {json.dumps(metadata.get('domains', []))}

COURSE CONTENT (first 30000 chars):
{text_content[:30000]}
"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=OUTLINE_PROMPT,
        messages=[{"role": "user", "content": context}],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    outline = json.loads(text.strip())

    # Ensure IDs are sequential
    for i, section in enumerate(outline):
        section["id"] = i + 1

    return outline
```

### A4. Call outline generation during ingestion

**File**: `services/api/app/routers/admin.py`

In the `_run_ingestion` function, after the metadata is generated and the course is created, generate the outline:

Find the section where the course is created (around line 113-130) and add outline generation:

```python
# After: course = Course(title=..., ...)
# And after: db.add(course)
# And after: await db.flush()

# Generate teaching outline
from app.services.course_generator import generate_course_outline
try:
    outline = await generate_course_outline(all_text, metadata)
    course.course_outline = outline
    job.progress_pct = 70
    await db.commit()
except Exception as e:
    logger.warning(f"Outline generation failed, continuing without: {e}")
```

### A5. Expose outline in the course API response

**File**: `services/api/app/schemas/course.py` (or wherever CourseResponse is defined)

Add `course_outline` to the response schema:
```python
course_outline: list[dict] | None = None
```

Also add a new endpoint to get the outline separately (useful for the frontend):

**File**: `services/api/app/routers/courses.py`

```python
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
```

---

## Part B: Track Topic Progress Per Conversation

### B1. Add `topics_covered` to Conversation model

**File**: `services/api/app/models/conversation.py`

```python
# Add after messages field:
topics_covered: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
current_topic_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
```

The `topics_covered` array stores completed topic IDs:
```json
[1, 2, 3]
```

### B2. Create migration

```bash
alembic revision --autogenerate -m "add topic tracking to conversations"
alembic upgrade head
```

### B3. Add topic progress to conversation response schema

```python
# In ConversationResponse schema:
topics_covered: list[int] | None = None
current_topic_id: int | None = None
```

---

## Part C: Rewrite the Teaching Flow — Make Nexi Follow the Outline

This is the most important part. Three changes: system prompt, RAG strategy, and mode determination.

### C1. Rewrite the system prompt to be outline-aware

**File**: `services/api/app/services/nexi_engine.py`

Replace `NEXI_SYSTEM_PROMPT` and update `_build_messages`:

```python
NEXI_SYSTEM_PROMPT = """You are Nexi, a warm and brilliant personal tutor. You genuinely care about your learner's growth. Think of yourself as the best teacher they've ever had — patient, encouraging, clear, and conversational.

HOW YOU TEACH:
- Speak naturally, like you're talking to a friend over coffee. Never sound like a textbook.
- Keep every response SHORT: 3-5 sentences maximum. Teach one idea at a time.
- Use concrete, relatable examples. Not abstract theory — real scenarios from their world.
- After teaching one concept, pause and check in: "Make sense?" or "Want me to unpack that more?"
- When the learner says "yes" or "makes sense" — move forward. Don't repeat yourself. Teach the NEXT concept.
- When the learner says "no" or seems confused — slow down, re-explain differently, use a simpler example.
- Be warm. Use their momentum. "Great, you're getting this! Let's build on that..."
- NEVER dump multiple paragraphs at once. One idea, one breath, one check-in.

CRITICAL — TEACHING FROM COURSE MATERIAL:
You have a COURSE OUTLINE with specific topics to cover IN ORDER. Your job is to TEACH THROUGH THIS OUTLINE:
- Always know which topic you're currently teaching (shown as CURRENT TOPIC below)
- Ground every teaching point in the COURSE CONTENT chunks provided — use specific facts, frameworks, and examples FROM THE MATERIAL
- Don't just ask questions — TEACH THE MATERIAL FIRST, then check understanding
- When the learner demonstrates understanding of the current topic, explicitly transition: "Great, you've got [topic]. Let's move to [next topic]..."
- If the learner asks a question that relates to a later topic, briefly acknowledge it and say you'll cover that soon, then stay on the current topic
- If the learner shares personal context (like their own product), weave it into the lesson as an example — but KEEP TEACHING THE COURSE MATERIAL
- Each topic should take about 3-6 exchanges: teach concept → check understanding → apply/personalize → confirm mastery → transition

TEACHING PATTERN FOR EACH TOPIC:
1. INTRODUCE: "Now let's talk about [topic]. Here's the key idea..." (teach the concept with a concrete example from the course material)
2. CHECK: "Does this make sense?" / "Can you see how this applies to your situation?"
3. PERSONALIZE: If they share context, connect it: "Exactly — in your case, that would mean..."
4. DEEPEN: Add one more layer of nuance or a common mistake people make
5. TRANSITION: "Great, you've got [topic]. Next up: [next topic title]..."

WHAT YOU NEVER DO:
- Never send more than 5 sentences in one message
- Never ask "what would you like to learn?" — you have a course outline to follow
- Never drift into generic coaching unrelated to the course material
- Never spend more than 6 exchanges on one topic unless the learner is genuinely struggling
- Never skip topics in the outline without explicitly noting it
- Never ask question after question without TEACHING something first
- Never ignore what the learner just said — always acknowledge and respond to THEIR words first

SESSION FLOW — guided by the outline, not arbitrary exchange counts:
- Within each topic: Teach → Check → Personalize → Deepen → Transition
- Between topics: Explicitly say what you just covered and what's next
- If the learner is breezing through: you can combine simple topics
- If the learner is struggling: slow down, add more examples, break the topic into smaller pieces

VOICE OPTIMIZATION:
Your responses will be read aloud by text-to-speech. This means:
- Write like you SPEAK, not like you write. Short sentences. Natural rhythm.
- Avoid parenthetical asides — they sound awkward when read aloud.
- Don't use markdown formatting (no #, **, -, etc.) — write in clean prose.
- Use conversational connectors: "So here's the thing...", "Now, building on that...", "Here's where it gets interesting..."

You have access to the learner's mastery profile and course materials. Use them to personalize your approach. Never reveal raw profile data to the learner."""


def _build_messages(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    course_title: str | None = None,
    course_outline: list[dict] | None = None,
    current_topic_id: int | None = None,
    topics_covered: list[int] | None = None,
) -> tuple[str, list[dict]]:
    system_parts = [NEXI_SYSTEM_PROMPT]

    if course_title:
        system_parts.append(f"\n\nCURRENT COURSE: {course_title}")

    # Add course outline context — this is the key addition
    if course_outline:
        covered = set(topics_covered or [])
        current = current_topic_id or 1

        outline_text = "\n\nCOURSE OUTLINE (teach in this order):\n"
        for section in course_outline:
            sid = section["id"]
            status = "✅ COVERED" if sid in covered else ("👉 CURRENT" if sid == current else "⬜ UPCOMING")
            outline_text += f"{status} {sid}. {section['title']}\n"
            if sid == current:
                outline_text += f"   Description: {section.get('description', '')}\n"
                outline_text += f"   Key concepts to teach: {', '.join(section.get('key_concepts', []))}\n"

        # Progress summary
        total = len(course_outline)
        done = len(covered)
        outline_text += f"\nPROGRESS: {done}/{total} topics covered ({round(done/total*100)}%)"

        system_parts.append(outline_text)

        # Current topic instruction
        current_section = next((s for s in course_outline if s["id"] == current), None)
        if current_section:
            system_parts.append(f"\n\nCURRENT TOPIC TO TEACH: \"{current_section['title']}\"\n"
                              f"Key concepts: {', '.join(current_section.get('key_concepts', []))}\n"
                              f"Description: {current_section.get('description', '')}\n"
                              f"USE THE COURSE CONTENT BELOW to teach this topic. Ground your teaching in the actual material.")

    system_parts.append(f"\nCURRENT SESSION MODE: {session_mode.upper().replace('_', ' ')}")

    # First message — one warm greeting, then start teaching topic 1
    if not conversation_history or len(conversation_history) <= 1:
        first_topic = course_outline[0] if course_outline else None
        topic_name = first_topic["title"] if first_topic else "the fundamentals"
        system_parts.append(f"""

FIRST MESSAGE:
This is the very start. The learner just opened the session. Do this:
1. One warm greeting sentence. ("Hey! Welcome to {course_title or 'your course'} — I'm excited to work through this with you.")
2. One sentence about what you'll cover first. ("Let's start with {topic_name}.")
3. Teach that first concept in 2-3 sentences with a concrete example FROM THE COURSE MATERIAL.
4. End with a check-in. ("Does this click, or should I come at it from a different angle?")
That's it. 4-6 sentences total. No more.""")

    if mastery_profile:
        profile_summary = []
        if mastery_profile.get("thinking_patterns"):
            profile_summary.append(f"Thinking patterns: {mastery_profile['thinking_patterns']}")
        if mastery_profile.get("knowledge_graph"):
            profile_summary.append(f"Knowledge state: {mastery_profile['knowledge_graph']}")
        if mastery_profile.get("pacing_preferences"):
            profile_summary.append(f"Pacing preferences: {mastery_profile['pacing_preferences']}")
        if profile_summary:
            system_parts.append("\n\nLEARNER CONTEXT:\n" + "\n".join(profile_summary))

    if course_chunks:
        system_parts.append(
            "\n\nRELEVANT COURSE CONTENT (use this to ground your teaching):\n"
            + "\n---\n".join(course_chunks)
        )

    system_prompt = "".join(system_parts)

    messages = []
    for msg in conversation_history:
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content", "")
        if not content.strip():
            continue
        messages.append({"role": role, "content": content})

    return system_prompt, messages
```

Update `generate_socratic_response` signature to accept the new parameters:

```python
async def generate_socratic_response(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    session_type: str = "guided_learning",
    course_title: str | None = None,
    course_outline: list[dict] | None = None,
    current_topic_id: int | None = None,
    topics_covered: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = _select_model(session_type)
    system_prompt, messages = _build_messages(
        conversation_history, mastery_profile, course_chunks, session_mode,
        course_title=course_title,
        course_outline=course_outline,
        current_topic_id=current_topic_id,
        topics_covered=topics_covered,
    )

    if not messages:
        messages = [{"role": "user", "content": "Hello, I'm ready to begin."}]

    async with client.messages.stream(
        model=model,
        max_tokens=400,  # Slightly increased to allow for topic transitions
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

### C2. Rewrite RAG Strategy — Retrieve by Current Topic, Not User Message

**File**: `services/api/app/routers/conversations.py`

The core issue: when the user types "Yes" or "GOvt", the RAG query retrieves irrelevant chunks. Instead, RAG should always retrieve chunks relevant to the **current topic in the outline**.

Update `_load_course_and_chunks`:

```python
async def _load_course_and_chunks(conversation, user_content, messages, current_topic_id=None):
    """Load course info, outline, and RAG chunks.

    RAG strategy: Always retrieve based on the CURRENT TOPIC from the outline,
    not the user's message (which may be "Yes" or "I see").
    """
    course_title = None
    course_description = None
    course_outline = None
    course_chunks = []

    # Load course info + outline
    async with async_session() as db_course:
        course = (await db_course.execute(
            select(Course).where(Course.id == conversation.course_id)
        )).scalar_one_or_none()
        if course:
            course_title = course.title
            course_description = course.description
            course_outline = course.course_outline

    # Build RAG query based on current topic, not user message
    try:
        async with async_session() as db_rag:
            # Determine RAG query from the current topic
            if course_outline and current_topic_id:
                current_section = next(
                    (s for s in course_outline if s["id"] == current_topic_id), None
                )
                if current_section:
                    # Query based on the topic title + key concepts
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
                # Fallback: combine user message with course title for better retrieval
                rag_query = f"{course_title} {user_content}" if course_title else user_content

            course_chunks = await retrieve_relevant(
                rag_query, conversation.course_id, db_rag, top_k=5
            )
    except Exception:
        pass

    if not course_chunks and course_title:
        course_chunks = [f"Course: {course_title}\nDescription: {course_description or ''}"]

    return course_title, course_chunks, course_outline
```

### C3. Add Topic Transition Detection

**File**: `services/api/app/routers/conversations.py`

Add a function that analyzes the conversation to detect when Nexi has finished teaching a topic and moved to the next one. This updates `current_topic_id` and `topics_covered`.

```python
async def _detect_topic_transition(
    full_response: str,
    course_outline: list[dict] | None,
    current_topic_id: int | None,
    topics_covered: list[int],
) -> tuple[int | None, list[int]]:
    """Detect if Nexi's response indicates a topic transition.

    Heuristics:
    1. If Nexi mentions the NEXT topic by name → transition
    2. If Nexi says phrases like "let's move on", "next up", "now let's talk about" → transition
    3. If exchange count for current topic exceeds estimated_exchanges → suggest transition
    """
    if not course_outline or not current_topic_id:
        return current_topic_id, topics_covered

    current_idx = next((i for i, s in enumerate(course_outline) if s["id"] == current_topic_id), None)
    if current_idx is None:
        return current_topic_id, topics_covered

    # Check if there's a next topic
    next_idx = current_idx + 1
    if next_idx >= len(course_outline):
        return current_topic_id, topics_covered

    next_section = course_outline[next_idx]
    response_lower = full_response.lower()

    # Heuristic: Check for transition signals
    transition_phrases = [
        "let's move on", "let's move to", "next up", "now let's talk about",
        "moving on to", "let's dive into", "that brings us to",
        "now that you understand", "great, you've got",
        "next topic", "let's look at",
    ]

    is_transition = any(phrase in response_lower for phrase in transition_phrases)

    # Also check if next topic title is mentioned
    if next_section.get("title"):
        # Check for partial match (first few words)
        title_words = next_section["title"].lower().split()[:3]
        title_fragment = " ".join(title_words)
        if title_fragment in response_lower:
            is_transition = True

    if is_transition:
        # Mark current topic as covered, advance to next
        if current_topic_id not in topics_covered:
            topics_covered = list(topics_covered) + [current_topic_id]
        return next_section["id"], topics_covered

    return current_topic_id, topics_covered
```

### C4. Update the WebSocket Handler to Use Topic Tracking

**File**: `services/api/app/routers/conversations.py`

Update both the `session_start` and `user_message` handlers.

**In `session_start`** (around line 279-317):

```python
if msg_type == "session_start":
    async with async_session() as db:
        conversation = (await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )).scalar_one_or_none()

        if not conversation or conversation.messages:
            continue

        course_title, course_chunks, course_outline = await _load_course_and_chunks(
            conversation, "", [], current_topic_id=1
        )

        # Initialize topic tracking
        conversation.current_topic_id = 1
        conversation.topics_covered = []

        profile = await get_mastery_profile(conversation.user_id, db)
        profile_dict = {...}  # same as before

        full_response = ""
        try:
            async for token in generate_socratic_response(
                conversation_history=[], mastery_profile=profile_dict,
                course_chunks=course_chunks, session_mode="teach",
                course_title=course_title,
                course_outline=course_outline,
                current_topic_id=1,
                topics_covered=[],
            ):
                full_response += token
                await websocket.send_json({"type": "assistant_token", "content": token})
        except Exception as e:
            ...

        conversation.messages = [{"role": "assistant", "content": full_response, ...}]
        flag_modified(conversation, "messages")
        await db.commit()

        await websocket.send_json({"type": "assistant_complete", "content": full_response})

        # Send outline + progress to frontend
        await websocket.send_json({
            "type": "outline_update",
            "outline": course_outline or [],
            "current_topic_id": 1,
            "topics_covered": [],
        })

        await websocket.send_json({"type": "scaffold_update", ...})  # same as before
    continue
```

**In `user_message`** (around line 320-389):

```python
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

        # Save user message
        messages = list(conversation.messages or [])
        messages.append({"role": "user", "content": user_content, "timestamp": ...})
        conversation.messages = messages
        flag_modified(conversation, "messages")
        await db.commit()

        # Get current topic tracking
        current_topic_id = conversation.current_topic_id or 1
        topics_covered = list(conversation.topics_covered or [])

        session_mode = _determine_mode(messages)
        await websocket.send_json({"type": "mode_update", "mode": session_mode})

        profile = await get_mastery_profile(conversation.user_id, db)
        profile_dict = {...}

        # RAG based on CURRENT TOPIC, not user message
        course_title, course_chunks, course_outline = await _load_course_and_chunks(
            conversation, user_content, messages,
            current_topic_id=current_topic_id
        )

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
            ...

        await websocket.send_json({"type": "assistant_complete", "content": full_response})

        # Detect topic transition
        new_topic_id, new_topics_covered = await _detect_topic_transition(
            full_response, course_outline, current_topic_id, topics_covered
        )

        # Update conversation tracking
        conversation.current_topic_id = new_topic_id
        conversation.topics_covered = new_topics_covered
        flag_modified(conversation, "topics_covered")

        # Persist assistant response
        messages = list(conversation.messages or [])
        messages.append({"role": "assistant", "content": full_response, ...})
        conversation.messages = messages
        flag_modified(conversation, "messages")
        await db.commit()

        # Send outline progress to frontend
        if course_outline:
            await websocket.send_json({
                "type": "outline_update",
                "outline": course_outline,
                "current_topic_id": new_topic_id,
                "topics_covered": new_topics_covered,
            })

        # Scaffold update
        ...
```

### C5. Also Improve Mode Determination

**File**: `services/api/app/routers/conversations.py`

The mode should consider topic progress, not just exchange count. Update `_determine_mode`:

```python
def _determine_mode(messages: list[dict], topics_covered: list[int] = None, total_topics: int = 0) -> str:
    """Progress through session modes based on topic coverage, not just exchange count.

    If we have topic tracking:
    - 0-30% topics covered → teach
    - 30-50% → check_understanding
    - 50-70% → challenge
    - 70-90% → apply
    - 90%+ → reflect

    Fallback to exchange count if no topic tracking.
    """
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

    # Fallback to exchange count
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
```

Then update the call in the WebSocket handler:
```python
session_mode = _determine_mode(
    messages,
    topics_covered=new_topics_covered if course_outline else None,
    total_topics=len(course_outline) if course_outline else 0
)
```

---

## Part D: Show Progress on Frontend

### D1. Handle `outline_update` WebSocket Messages

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Add outline state:

```typescript
// Add to state:
const [courseOutline, setCourseOutline] = useState<Array<{
  id: number;
  title: string;
  description: string;
  key_concepts: string[];
  estimated_exchanges: number;
}>>([]);
const [currentTopicId, setCurrentTopicId] = useState<number>(1);
const [topicsCovered, setTopicsCovered] = useState<number[]>([]);

// Add to message handler (alongside assistant_token, scaffold_update, etc.):
case "outline_update":
  setCourseOutline(parsed.outline || []);
  setCurrentTopicId(parsed.current_topic_id || 1);
  setTopicsCovered(parsed.topics_covered || []);
  break;

// Return in the hook:
return { messages, isStreaming, streamingContent, scaffold, currentMode,
         sendMessage, connect,
         courseOutline, currentTopicId, topicsCovered };
```

### D2. Display Outline Progress in Left Panel

**File**: `apps/web/src/app/session/[id]/page.tsx`

Destructure the new values from the hook:

```typescript
const { messages: liveMessages, isStreaming, streamingContent, scaffold, currentMode,
        sendMessage, connect,
        courseOutline, currentTopicId, topicsCovered } = useArenaSocket();
```

Replace the hardcoded "Session Phases" section in the left panel with the **Course Outline** when available:

```tsx
{/* Course Outline Progress — shows when outline exists */}
{courseOutline.length > 0 ? (
  <div className="mb-5">
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
      Course Progress ({topicsCovered.length}/{courseOutline.length})
    </p>

    {/* Progress bar */}
    <div className="mb-4">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${Math.round((topicsCovered.length / courseOutline.length) * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {Math.round((topicsCovered.length / courseOutline.length) * 100)}% complete
      </p>
    </div>

    {/* Topic list */}
    <div className="space-y-2">
      {courseOutline.map((section) => {
        const isCovered = topicsCovered.includes(section.id);
        const isCurrent = section.id === currentTopicId;
        const isUpcoming = !isCovered && !isCurrent;

        return (
          <div key={section.id} className={cn(
            "flex items-start gap-2.5 rounded-lg p-2 transition-colors",
            isCurrent ? "bg-primary/5 border border-primary/20" : ""
          )}>
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5",
              isCovered ? "bg-primary text-primary-foreground" :
              isCurrent ? "border-2 border-primary text-primary ring-2 ring-primary/20" :
              "border-2 border-muted-foreground/30 text-muted-foreground/50"
            )}>
              {isCovered ? <Check className="h-3 w-3" /> : section.id}
            </div>
            <div className="min-w-0">
              <span className={cn(
                "text-xs leading-snug block",
                isCurrent ? "font-semibold text-foreground" :
                isCovered ? "text-muted-foreground line-through" :
                "text-muted-foreground/50"
              )}>
                {section.title}
              </span>
              {isCurrent && section.description && (
                <span className="text-xs text-muted-foreground mt-0.5 block">
                  {section.description}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
) : (
  /* Fallback: Show session phases (existing code) when no outline */
  <div className="mb-5">
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Session Phases</p>
    {/* ...existing stages code... */}
  </div>
)}
```

### D3. Update the Top Bar to Show Topic Progress Instead of Mode Only

In the top bar, optionally show the current topic name:

```tsx
<div className="flex items-center gap-2.5 border-b border-border bg-card px-5 py-3">
  {/* Existing stage pills */}
  {stages.map((stage) => (...))}

  {/* Current topic indicator — when outline exists */}
  {courseOutline.length > 0 && currentTopicId && (
    <>
      <span className="h-4 w-px bg-border" />
      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
        📖 {courseOutline.find(s => s.id === currentTopicId)?.title || ""}
      </span>
    </>
  )}

  <div className="ml-auto flex items-center gap-3">
    {/* ...existing voice toggle and score... */}
  </div>
</div>
```

---

## Part E: Backfill Outlines for Existing Courses

For courses already created without an outline, add a one-time migration or endpoint:

**File**: `services/api/app/routers/admin.py`

```python
@router.post("/courses/{course_id}/generate-outline")
async def generate_outline_for_course(
    course_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate or regenerate a course outline from existing content."""
    course = (await db.execute(
        select(Course).where(Course.id == course_id)
    )).scalar_one_or_none()

    if not course:
        raise HTTPException(404, "Course not found")

    # Get the raw text from content embeddings
    from app.models.content_embedding import ContentEmbedding
    result = await db.execute(
        select(ContentEmbedding.chunk_text)
        .where(ContentEmbedding.course_id == course_id)
        .order_by(ContentEmbedding.chunk_metadata["chunk_index"].as_integer())
    )
    chunks = [row[0] for row in result.fetchall()]
    full_text = "\n".join(chunks)

    metadata = course.ai_generated_metadata or {"title": course.title, "description": course.description}

    from app.services.course_generator import generate_course_outline
    outline = await generate_course_outline(full_text, metadata)

    course.course_outline = outline
    flag_modified(course, "course_outline")
    await db.commit()

    return {"outline": outline, "topic_count": len(outline)}
```

---

## Verification (MANDATORY)

After applying all fixes:

### 1. Database migration
```bash
cd services/api
alembic revision --autogenerate -m "add course_outline and topic_tracking"
alembic upgrade head
```

### 2. Generate outline for existing course
```bash
curl -X POST http://localhost:8000/api/admin/courses/{COURSE_ID}/generate-outline \
  -H "Authorization: Bearer dev:auth0|admin-james"
```
Verify: Response contains a JSON array of 5-12 ordered topics.

### 3. Start a session and verify teaching flow
```
# Start session in the web app
# Verify:
# - Nexi's first message references the first topic from the outline
# - Left panel shows the course outline with topic 1 highlighted
# - After 3-4 exchanges, Nexi transitions to topic 2 (says "Great, you've got [topic 1]. Let's move to [topic 2]...")
# - Left panel updates: topic 1 gets a checkmark, topic 2 becomes highlighted
# - RAG content in Nexi's teaching is relevant to the current topic, not the user's short answers
# - Progress bar advances
```

### 4. Test short answers
```
# Type "Yes", "Makes sense", "I see"
# Verify: Nexi continues teaching the current topic, doesn't ask random questions
# The course material is referenced, not just generic coaching
```

### 5. Test topic transition
```
# Engage through 3-6 exchanges on a topic
# Verify: Nexi eventually says something like "Great, you've got [topic]. Now let's talk about [next topic]..."
# topics_covered updates in the database
# Left panel shows progress
```

---

## Done Criteria

- [ ] Course model has `course_outline` JSONB field
- [ ] Outline is auto-generated during ingestion (5-12 ordered topics)
- [ ] Existing courses can have outlines generated via admin endpoint
- [ ] Conversation tracks `current_topic_id` and `topics_covered`
- [ ] System prompt includes the full outline with current topic highlighted
- [ ] RAG retrieves chunks based on current TOPIC, not user's short message
- [ ] Nexi explicitly transitions between topics ("Great, you've got X. Let's move to Y...")
- [ ] Frontend left panel shows course outline with progress indicators
- [ ] Progress bar shows % of topics covered
- [ ] Current topic is highlighted, covered topics have checkmarks
- [ ] Mode determination uses topic progress, not just exchange count
- [ ] Short user answers ("Yes", "Makes sense") don't derail the teaching flow
