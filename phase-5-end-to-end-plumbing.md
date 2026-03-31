# Phase 5: End-to-End Plumbing — Claude Code Prompt

> **Context**: Nexus² Mastery Platform. Phases 1-3 built the core backend and learner frontend. Phase 4 built the Admin Studio (admin router, file upload, course generation, user management, analytics, org settings). The teaching mode update changed Nexi from pure Socratic questioning to a teach-first flow (teach → check_understanding → challenge → apply → reflect). **Phase 5 connects everything end-to-end** — so that the full journey from "admin uploads content" to "learner completes a mastery session and grows" actually works.

---

## Current State (What Already Works)

**Backend services built:**
- Nexi engine with teach-first system prompt, model routing (Sonnet/Haiku), dynamic context injection
- RAG pipeline: embed, chunk, retrieve (pgvector cosine similarity)
- Voice service: Deepgram STT + ElevenLabs TTS + REST `/api/voice/tts` endpoint
- File storage service: save, delete, list per-tenant files
- Course generator: Claude Sonnet analysis → structured JSON metadata
- Mastery service: get/update mastery profile

**Backend routers built:**
- Auth (`GET /api/auth/me`)
- Courses (full CRUD, org-scoped, role-checked)
- Conversations (CRUD + WebSocket streaming with RAG + mastery profile + scaffold updates)
- Programs (list, get by id, get active/me with eager loading)
- Mastery (profile access with privacy enforcement, enrollments)
- Voice (WebSocket stream with auth + mastery context, REST TTS)
- Orgs (`GET/PUT /api/orgs/me`)
- Admin (upload, generate, ingestion polling, publish/unpublish, user management, bulk import, analytics, org settings)

**Frontend built:**
- Learner app (`apps/web/`): Dashboard, session page, layout, sidebar, hooks (useArenaSocket, useVoice), LearnerContext with API + mock fallback
- Admin app (`apps/admin/`): Basic scaffolding (4 pages with mock data — not yet rebuilt to match Arena design)

**Infrastructure:**
- Docker: pgvector:pg16 + redis:7
- Alembic: initialized with env.py and versions directory
- Turbo monorepo: build/dev/lint/test tasks
- Test fixtures: conftest.py with learner_client, admin_client, unauthenticated_client
- Seed: Full program with 5 domains, 17 capabilities, 6 milestones, 3 focus sessions

---

## What's Missing (The Gaps This Phase Closes)

### The core problem:
The admin can create a course and the learner can have a session, but these two journeys are not connected. An admin uploading content does not result in a learner being able to practice against it. This phase wires them together.

---

## Task 0: Fix Remaining Bugs

### 0a. Fix RAG chunk attribute error (STILL BROKEN)
**File**: `/services/api/app/routers/conversations.py`, line 218

```python
# BROKEN — retrieve_relevant() returns list[str], not objects with .chunk_text
course_chunks = [c.chunk_text for c in chunks]

# FIX
course_chunks = chunks
```

### 0b. Ingestion worker reads files as text only
**File**: `/services/api/app/routers/admin.py`, line 95

The `_run_ingestion` function reads ALL files with `open(file_path, "r", errors="ignore")` — this only works for text files. PDFs and DOCX files will be garbled. Use the existing `rag_pipeline.ingest_document()` logic which already handles PDF (pypdf), DOCX (python-docx), and TXT/MD:

```python
# Replace the simple file read with proper extraction
from app.services.rag_pipeline import ingest_document

# For each file, extract text using rag_pipeline's format-aware extraction
# instead of raw open().read()
```

---

## Task 1: Enrollment Flow

There is NO way to enroll a learner in a course. The Enrollment model exists, but nothing creates enrollments except the seed script.

### 1a. Enrollment endpoints
**File**: Create `/services/api/app/routers/enrollments.py`

```
POST   /api/enrollments              — Learner self-enrolls in a published course
                                       Body: { course_id: UUID }
                                       Creates Enrollment with mastery_status="not_started"
                                       Only works for courses with status="active" (published)

DELETE /api/enrollments/{id}         — Learner un-enrolls (soft? or hard delete)

GET    /api/enrollments/me           — Already exists in mastery.py, keep it there

POST   /api/admin/enrollments        — Admin enrolls a user in a course
                                       Body: { user_id: UUID, course_id: UUID }
                                       Only org_admin can do this

POST   /api/admin/enrollments/bulk   — Admin enrolls multiple users at once
                                       Body: { user_ids: [UUID], course_id: UUID }
```

Register in `main.py`.

### 1b. Auto-create mastery profile on enrollment
When a learner is enrolled for the first time and doesn't have a MasteryProfile yet, create one with empty defaults:

```python
# In the enrollment creation logic:
existing_profile = await get_mastery_profile(user_id, db)
if not existing_profile:
    profile = MasteryProfile(
        user_id=user_id,
        thinking_patterns={},
        knowledge_graph={},
        pacing_preferences={"optimal_session_length": 25},
        course_progress={},
    )
    db.add(profile)
```

---

## Task 2: Course Discovery for Learners

The learner dashboard shows the "active program" but has no way to see available courses or start a new session against a specific course.

### 2a. Available courses endpoint
**File**: `/services/api/app/routers/courses.py`

Add a learner-facing endpoint that returns published courses the learner is enrolled in:

```python
@router.get("/me/enrolled", response_model=list[CourseResponse])
async def list_my_courses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Learner sees courses they're enrolled in."""
    result = await db.execute(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user.id, Course.status == CourseStatus.active)
    )
    return result.scalars().all()
```

Also add an endpoint for browsing available (published) courses in the org that the learner is NOT yet enrolled in:

```python
@router.get("/me/available", response_model=list[CourseResponse])
async def list_available_courses(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Courses available to enroll in (published, not already enrolled)."""
    enrolled_ids = select(Enrollment.course_id).where(Enrollment.user_id == user.id)
    result = await db.execute(
        select(Course).where(
            Course.org_id == org_id,
            Course.status == CourseStatus.active,
            Course.id.not_in(enrolled_ids),
        )
    )
    return result.scalars().all()
```

### 2b. Add to frontend API client
**File**: `apps/web/src/lib/api-client.ts`

```typescript
listMyCourses: () => this.get<Course[]>("/api/courses/me/enrolled"),
listAvailableCourses: () => this.get<Course[]>("/api/courses/me/available"),
enrollInCourse: (courseId: string) => this.post("/api/enrollments", { course_id: courseId }),
```

### 2c. Update learner dashboard
**File**: `apps/web/src/app/page.tsx`

Below the current "Start Next Session" hero card, add a "Your Courses" section that shows courses the learner is enrolled in. Each card has:
- Course title and description
- A "Start Session" button that creates a conversation and navigates to `/session/{conversationId}`
- Progress indicator (from enrollment mastery_status)

Below that, if there are available courses they're NOT enrolled in, show a "Browse Courses" section with an "Enroll" button on each.

### 2d. Dynamic session creation
**File**: `apps/web/src/app/session/[id]/page.tsx`

Currently the session page expects a hardcoded session ID. Change it to:
1. If the `[id]` matches an existing conversation UUID, load it (resume session)
2. If the `[id]` is `new?course={courseId}`, create a new conversation via `POST /api/conversations` with that course_id, then redirect to the real conversation URL

---

## Task 3: RAG Indexing on Course Creation

When the ingestion pipeline creates a course from uploaded files, the content should be RAG-indexed so Nexi can use it during sessions.

### 3a. Add RAG indexing to the ingestion pipeline
**File**: `/services/api/app/routers/admin.py` → `_run_ingestion()`

After creating the Course record (around line 126), add a RAG indexing step:

```python
from app.services.rag_pipeline import store_chunks, embed_text, _chunk_text

# After course is created and before marking complete:
job.status = IngestionStatus.embedding
job.progress_pct = 80
job.current_step = "Indexing content for AI retrieval"
await db.commit()

# Chunk and embed the full extracted text
chunks = _chunk_text(all_text)
job.chunks_total = len(chunks)
await db.commit()

for i, chunk_text in enumerate(chunks):
    embedding = await embed_text(chunk_text)
    db.add(ContentEmbedding(
        course_id=course.id,
        chunk_text=chunk_text,
        embedding=embedding,
    ))
    job.chunks_processed = i + 1
    if i % 10 == 0:
        await db.commit()

await db.commit()
```

This means when a learner starts a session on this course, `retrieve_relevant()` in the conversations router will actually find relevant content and inject it into Nexi's context. The teaching mode will have real course material to teach from.

---

## Task 4: Mastery Profile Write-Back After Sessions

Currently the mastery profile is READ during sessions but NEVER UPDATED. After a session, the learner's thinking patterns, knowledge graph, and capability levels should update based on how they performed.

### 4a. Session assessment service
**File**: Create `/services/api/app/services/session_assessment.py`

```python
async def assess_session(
    conversation_messages: list[dict],
    mastery_profile: dict,
    course_metadata: dict,
) -> dict:
    """
    After a session ends, send the full conversation to Claude Sonnet
    to assess the learner's performance.

    Returns:
    {
        "thinking_patterns_update": {...},  # merge into existing patterns
        "knowledge_graph_update": {...},    # new concepts mastered/struggling
        "capability_assessments": [         # per-capability level changes
            {"capability_name": str, "delta": float, "reasoning": str}
        ],
        "session_summary": str,            # 2-3 sentence summary
        "strengths_observed": [str],
        "areas_for_improvement": [str],
    }

    Use Claude Sonnet (assessment is a complex task).
    System prompt should explain the mastery model and ask for structured JSON.
    """
```

### 4b. Trigger assessment when session ends
**File**: `/services/api/app/routers/conversations.py`

Add a session completion endpoint:

```python
@router.post("/{conversation_id}/complete")
async def complete_conversation(
    conversation_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark conversation as complete and trigger mastery assessment."""
    conversation = ...  # load conversation

    conversation.ended_at = datetime.now(timezone.utc)

    # Run assessment
    assessment = await assess_session(
        conversation.messages,
        mastery_profile_dict,
        course_metadata,
    )

    # Update mastery profile
    profile = await get_mastery_profile(user.id, db)
    if profile:
        # Merge thinking patterns
        existing = profile.thinking_patterns or {}
        existing.update(assessment.get("thinking_patterns_update", {}))
        profile.thinking_patterns = existing

        # Merge knowledge graph
        kg = profile.knowledge_graph or {}
        kg.update(assessment.get("knowledge_graph_update", {}))
        profile.knowledge_graph = kg

        # Store session summary in conversation_summary
        summaries = profile.conversation_summary or []
        summaries.append({
            "conversation_id": str(conversation_id),
            "summary": assessment.get("session_summary", ""),
            "date": datetime.now(timezone.utc).isoformat(),
        })
        profile.conversation_summary = summaries

    # Update capability levels if course is linked to a program
    for cap_assessment in assessment.get("capability_assessments", []):
        # Find matching capability and update level
        ...

    # Update enrollment mastery_status
    enrollment = ...
    if enrollment:
        enrollment.mastery_status = MasteryStatus.in_progress

    await db.commit()
    return {"status": "completed", "assessment": assessment}
```

### 4c. Frontend: End session button
The session page needs a "Finish Session" button (visible after the reflect phase) that calls `POST /api/conversations/{id}/complete`. Show the session summary + strengths/improvements as a completion card.

---

## Task 5: Auth0 Login Flow

Neither frontend has a real login flow. Both use `USE_MOCK=true` with hardcoded dev tokens.

### 5a. Install Auth0 Next.js SDK in both apps

```bash
cd apps/web && npm install @auth0/nextjs-auth0
cd apps/admin && npm install @auth0/nextjs-auth0
```

### 5b. Add Auth0 API route handler
**File**: `apps/web/src/app/api/auth/[auth0]/route.ts` (same for admin app)

```typescript
import { handleAuth } from "@auth0/nextjs-auth0";
export const GET = handleAuth();
```

### 5c. Add Auth0 provider to layout
Wrap the app in `UserProvider` from `@auth0/nextjs-auth0/client`.

### 5d. Add login/logout buttons
- If not authenticated → show login page with "Sign in" button
- If authenticated → inject the Auth0 access token into API calls
- Update `api-client.ts` to get token from Auth0 session instead of dev mode

### 5e. Auto-provision user on first login
**File**: `/services/api/app/middleware/auth.py`

Update `get_current_user` — if a valid JWT comes in but no User record exists for that `auth0_sub`, create one:

```python
async def get_current_user(...):
    payload = await verify_token(credentials)
    auth0_sub = payload["sub"]

    # Look up user
    result = await db.execute(select(User).where(User.auth0_sub == auth0_sub))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-provision: Check if there's a pending invite by email
        email = payload.get("email", "")
        invite_result = await db.execute(
            select(User).where(User.email == email, User.auth0_sub.startswith("auth0|pending-"))
        )
        invited_user = invite_result.scalar_one_or_none()

        if invited_user:
            # Link the invite to the real Auth0 identity
            invited_user.auth0_sub = auth0_sub
            invited_user.display_name = payload.get("name", invited_user.display_name)
            await db.commit()
            user = invited_user
        else:
            raise HTTPException(403, "No account found. Contact your organization admin.")

    return user
```

### 5f. Environment variables
Add to both `apps/web/.env.local` and `apps/admin/.env.local`:
```
AUTH0_SECRET=<random-secret>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_AUDIENCE=<api-audience>
```

---

## Task 6: Alembic First Migration

Alembic is initialized but has no migrations yet. Create the first migration covering ALL existing models.

```bash
cd services/api
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Verify that `env.py` imports all models from `app.models` so autogenerate sees them. If the DB already has tables from `create_all`, you may need to `alembic stamp head` first.

---

## Task 7: Connect Courses to Programs

The Course model has `program_id` FK, and the ingestion pipeline already creates a Program when generating a course. But the relationship needs to be surfaced to the learner.

### 7a. Add courses relationship to Program model
**File**: `/services/api/app/models/program.py`

```python
# In the Program class, add:
courses = relationship("Course", backref="program", foreign_keys="Course.program_id")
```

### 7b. Update active program response to include courses
**File**: `/services/api/app/routers/programs.py`

In `_build_program_response()`, include the program's courses:

```python
return {
    ...existing fields...,
    "courses": [{"id": c.id, "title": c.title, "description": c.description, "status": c.status}
                for c in program.courses] if hasattr(program, 'courses') else [],
}
```

Add `selectinload(Program.courses)` to the query options in `get_program` and `get_my_active_program`.

### 7c. Update LearnerContext
**File**: `apps/web/src/contexts/LearnerContext.tsx`

Add `courses` to the Program interface and map it from the API response. The dashboard can then show which courses belong to the active program.

---

## Task 8: Tests

Write tests for the new plumbing:

**`/services/api/tests/test_enrollments.py`**:
- Learner can self-enroll in published course
- Learner cannot enroll in draft course
- Admin can enroll any user
- Duplicate enrollment returns error
- Auto-creates mastery profile on first enrollment

**`/services/api/tests/test_session_flow.py`**:
- Create conversation → stream messages → complete → assessment runs
- Mastery profile updated after completion
- Session summary stored in conversation_summary

**`/services/api/tests/test_rag_integration.py`**:
- Upload file → generate course → RAG index → retrieve chunks → chunks appear in conversation context

**`/services/api/tests/test_admin_pipeline.py`**:
- Upload → generate → poll → course created with program
- Generated course has RAG-indexed content
- Publishing makes course visible to learners

---

## Priority Order

1. **P0**: Task 0 — Fix bugs (RAG crash + ingestion file reading) — 15 min
2. **P0**: Task 3 — RAG indexing in ingestion pipeline — 30 min (without this, teaching mode has nothing to teach from)
3. **P1**: Task 1 — Enrollment flow — 1 hour
4. **P1**: Task 2 — Course discovery + dynamic session creation — 2 hours
5. **P1**: Task 4 — Mastery write-back after sessions — 2 hours (this is what makes the platform adaptive)
6. **P2**: Task 7 — Connect courses to programs — 1 hour
7. **P2**: Task 5 — Auth0 login flow — 2 hours
8. **P2**: Task 6 — First Alembic migration — 30 min
9. **P3**: Task 8 — Tests — 2 hours
