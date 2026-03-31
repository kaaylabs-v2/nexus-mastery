# Phase 4: Admin Studio Backend + Integration — Claude Code Prompt

> **Context**: Nexus² Mastery Platform. Phases 1-3 built the backend (FastAPI + PostgreSQL/pgvector + Redis), the learner frontend (Next.js), Socratic AI engine (Claude Sonnet/Haiku), RAG pipeline, Auth0 JWT auth, and voice service (Deepgram + ElevenLabs). Phase 4 builds the **Admin Studio backend**, fixes known bugs, and **wires the admin frontend to real APIs**.

> **UX Principle (applies to ALL frontend work)**: Every screen should be usable by someone seeing it for the first time with zero training. Hide technical complexity behind simple interactions. Use plain language, not jargon. Show the user what to do next, not every option at once. Think Google NotebookLM — drop files and it just works. The backend can be sophisticated; the frontend should feel effortless.

---

## Codebase Layout

```
/                         ← Turbo monorepo root
├── apps/
│   ├── web/              ← Learner frontend (Next.js, working)
│   └── admin/            ← Admin frontend (basic scaffolding — to be rebuilt)
├── services/
│   └── api/              ← FastAPI backend (shared by both frontends)
│       ├── app/
│       │   ├── core/     ← config.py, database.py, security.py
│       │   ├── middleware/ ← auth.py, tenant.py
│       │   ├── models/   ← Organization, User, Course, MasteryProfile, Enrollment, Conversation, ContentEmbedding, Program (+ Domain, Capability, Milestone, FocusSession)
│       │   ├── routers/  ← auth, courses, conversations, orgs, mastery, programs, voice
│       │   ├── schemas/  ← Pydantic response/request models
│       │   └── services/ ← nexi_engine, rag_pipeline, voice_service, mastery_service
│       ├── tests/        ← conftest.py with fixtures (no test files yet)
│       └── seed.py       ← Full seed data
├── infra/
│   └── docker-compose.yml ← postgres (pgvector:pg16) + redis:7
├── turbo.json
└── package.json
```

---

## UI Reference

The Arena repo has a complete Admin Studio frontend with 7 pages and the full design system. **Use this as the reference for building the admin app:**

**GitHub**: https://github.com/kaaylabs-v2/personal-arena

**Admin pages** (in `/src/pages/admin/`):

| Page | File | What It Renders |
|------|------|----------------|
| Layout | `AdminLayout.tsx` + `AdminSidebar.tsx` + `AdminTopBar.tsx` | shadcn Sidebar, 6 nav items (Overview, Programs, Users, Upload & Generate, Analytics, Settings), "Arena Studio" branding |
| Dashboard | `AdminDashboard.tsx` | StatCards (learners, programs, completion rate), Top Programs with progress bars, Recent Activity feed |
| Programs | `AdminPrograms.tsx` | Card list with dimensions count, scenario count, learner count, click → detail |
| Program Detail | `AdminProgramDetail.tsx` | 3 tabs: Scenarios (drag handles, difficulty, turns), Dimensions (weight %, totaling 100%), Materials (file table with chunks count) |
| Upload & Generate | `AdminUploadPipeline.tsx` | **Redesign this page — see "Upload UX Philosophy" below.** The Arena version shows a 5-stage technical pipeline. Replace with a seamless NotebookLM-style experience. |
| Users | `AdminUsers.tsx` | User table with search, CSV bulk import with preview/validation, invite dialog |
| Analytics | `AdminAnalytics.tsx` | Recharts (AreaChart sessions over time, PieChart level distribution, BarChart program comparison), program breakdown table |
| Settings | `AdminSettings.tsx` | 4 tabs: General (name, logo, brand color), SSO (SAML + enforce toggle), API Keys (masked display), Webhooks (event subscriptions) |

**Admin components** (in `/src/components/admin/`):
- `StatCard.tsx` — reusable metric card with icon, value, trend

**Design system**: shadcn/ui components, Framer Motion animations, Recharts charts, Lucide React icons, Inter body font, DM Sans heading font, primary color `hsl(174, 42%, 40%)`.

**Rebuild `apps/admin/` to match the Arena admin UI** — port the 7 pages + components into the Mastery monorepo's admin app using Next.js App Router (same pattern as `apps/web/`). Replace all mock/hardcoded data with real API calls as you build each page.

---

## Upload UX Philosophy — "NotebookLM-Level Seamless"

The Upload & Generate page is the hero feature of Admin Studio. The Arena repo currently shows a 5-stage technical pipeline (upload → extract → analyze → chunk → generate) where the admin watches internal processing stages tick through. **Do NOT build it that way.** Instead, model the experience after Google NotebookLM — where uploading is instant, effortless, and the complexity is invisible.

### The experience should be:

**1. Drop zone (the only thing the admin sees first):**
A large, beautiful drag-and-drop area that takes up most of the page. "Drop your training materials here" with a subtle file icon. Accepts PDFs, Word docs, slide decks, text files — multiple at once. No file type selector, no metadata form, no configuration. Just drop and go. Also show a small list of previously uploaded sources (like NotebookLM's source panel) so the admin can see what's already in the system.

**2. While processing (hide the machinery):**
After files are dropped, show a single clean card: "Creating your course..." with ONE subtle progress animation — not 5 labeled stages, not chunk counts, not embedding percentages. Just a gentle indicator that communicates "working on it." Optionally, one line of natural text that updates: "Reading your files..." → "Analyzing content..." → "Almost ready..." The admin should be able to navigate away and come back — the job runs async.

**3. When done (the magic moment):**
Transition smoothly to an AI-generated course preview. Show the suggested title, description, competencies, and scenarios — all **editable inline**. The admin tweaks whatever they want (or accepts as-is) and hits one button: "Publish." That's it. No separate review screen, no "confirm and generate" step. The AI did the work, the admin refines it, done.

**4. Error handling (graceful, not technical):**
If something fails, don't show stack traces or "IngestionJob failed at stage 3." Show: "We had trouble reading one of your files. Try uploading it again, or use a different format." Offer a retry button.

**Key principle:** The 5-stage pipeline (extract → analyze → chunk → embed → generate) is the backend architecture. The admin never needs to see it. The frontend shows: drop files → wait → review & publish. Three steps, not five.

---

## Task 0: Fix Existing Bugs (Do This First)

### 0a. Fix RAG chunk attribute error
**File**: `/services/api/app/routers/conversations.py`, line 176
```python
# BROKEN — retrieve_relevant() returns list[str], not objects with .chunk_text
course_chunks = [c.chunk_text for c in chunks]

# FIX — chunks is already a list of strings
course_chunks = chunks
```

### 0b. ~~Add Program models to __init__.py~~ — DONE
**File**: `/services/api/app/models/__init__.py`

**Already fixed.** The `__init__.py` now exports all models including Program, Domain, Capability, Milestone, FocusSession, CourseFile, UploadStatus, IngestionJob, and IngestionStatus. Verify this is correct and move on.

### 0c. Add authentication to voice WebSocket
**File**: `/services/api/app/routers/voice.py`

The voice WebSocket endpoint has no auth at all — any connection is accepted. Add JWT verification (extract token from query param like `?token=...` since WebSocket headers are limited). Also wire in real context:
- Load mastery profile for the authenticated user
- Load course chunks via RAG if a course_id is provided
- Maintain conversation history across the session (currently it sends single-turn `[{"role": "user", "content": transcript}]` every time)
- Pass the real session_mode instead of hardcoding "clarify"

### 0d. Fix enrollment count response key mismatch
**File**: `/services/api/app/routers/mastery.py`, line 98

Backend returns `{"enrollment_count": count}` but the frontend api-client expects `{"count": count}`. Change to:
```python
return {"count": count}
```

---

## Task 1: Initialize Alembic + New Models

### 1a. Initialize Alembic
There is NO existing Alembic directory. Set it up from scratch:
```bash
cd services/api
alembic init alembic
```
Configure `alembic/env.py` for async SQLAlchemy (the app uses `AsyncSession` everywhere). Point it at the existing `DATABASE_URL` from `app.core.config`. Import `Base` from `app.core.database` and all models from `app.models` so autogenerate can see them.

Create the **first migration** covering ALL existing models (Organization, User, Course, MasteryProfile, Enrollment, Conversation, ContentEmbedding, Program, Domain, Capability, Milestone, FocusSession) plus the new models below.

### 1b. `CourseFile` model (`/services/api/app/models/course_file.py`)
```python
class CourseFile(Base):
    __tablename__ = "course_files"
    id: UUID (PK, default uuid4)
    course_id: UUID (FK → courses.id, nullable — null before course is generated)
    org_id: UUID (FK → organizations.id, NOT NULL)
    filename: str           # stored filename (uuid-based)
    original_filename: str  # what user uploaded
    file_type: str          # "pdf", "docx", "txt", "md", "pptx", "csv"
    file_size: int          # bytes
    storage_path: str       # relative path within tenant storage
    upload_status: Enum("pending", "uploaded", "processing", "completed", "failed")
    uploaded_by: UUID (FK → users.id)
    created_at: datetime (default utcnow)
```

### 1c. `IngestionJob` model (`/services/api/app/models/ingestion_job.py`)
```python
class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    id: UUID (PK, default uuid4)
    course_id: UUID (FK → courses.id, nullable — set when course is created)
    org_id: UUID (FK → organizations.id, NOT NULL)
    status: Enum("queued", "extracting", "analyzing", "chunking", "embedding", "completed", "failed")
    progress_pct: int (default 0, range 0-100)
    current_step: str (nullable)
    chunks_total: int (nullable)
    chunks_processed: int (default 0)
    ai_generated_metadata: JSONB (nullable)  # Claude's extracted title, description, criteria, scenarios
    error_message: str (nullable)
    file_ids: ARRAY(UUID)    # list of CourseFile IDs being processed
    created_by: UUID (FK → users.id)
    created_at: datetime (default utcnow)
    completed_at: datetime (nullable)
```

### 1d. Modify `Course` model — add fields:
```python
source_type: Enum("manual", "uploaded")  # default "manual"
ai_generated_metadata: JSONB (nullable)  # Claude's full analysis output
published_at: datetime (nullable)        # null = draft, set on publish
```

### 1e. Create migration.
New models (CourseFile, IngestionJob) are already registered in `__init__.py`. Just create the Alembic migration.

---

## Task 2: File Storage Service

### `/services/api/app/services/file_storage.py`

Per-tenant isolated file storage:

```python
# Storage path: {UPLOAD_DIR}/{org_id}/{batch_id}/{filename}

async def save_uploaded_file(
    file: UploadFile,
    org_id: UUID,
    uploaded_by: UUID,
    db: AsyncSession
) -> CourseFile:
    """
    1. Validate file type (pdf, docx, txt, md, pptx, csv only)
    2. Validate file size (max 100MB)
    3. Generate unique filename (uuid + extension)
    4. Save to {UPLOAD_DIR}/{org_id}/{date}/{filename}
    5. Create CourseFile record with upload_status="uploaded"
    6. Return CourseFile
    """

async def get_file_path(file_id: UUID, org_id: UUID, db: AsyncSession) -> str:
    """Return full path, enforce org_id match"""

async def delete_file(file_id: UUID, org_id: UUID, db: AsyncSession) -> None:
    """Delete file from disk and DB, enforce org_id match"""

async def list_course_files(course_id: UUID, org_id: UUID, db: AsyncSession) -> list[CourseFile]:
    """List all files for a course, scoped by org_id"""
```

Add to `config.py`:
```python
UPLOAD_DIR: str = "./uploads"
MAX_UPLOAD_SIZE_MB: int = 100
```

---

## Task 3: Course Generator Service

### `/services/api/app/services/course_generator.py`

AI-powered course generation using Claude:

```python
async def analyze_content_for_course(text_content: str) -> dict:
    """
    Send extracted text to Claude Sonnet to generate:
    {
        "title": str,
        "description": str (2-3 sentences),
        "mastery_criteria": [{"name": str, "description": str, "target_level": int (1-5)}],
        "topics": [str],
        "scenarios": [{"title": str, "description": str, "difficulty": int (1-5), "turns": int}],
        "estimated_hours": int,
        "difficulty_level": "beginner" | "intermediate" | "advanced",
        "domain": str  # "Professional", "Academic", "Corporate", etc.
    }

    System prompt explains the Nexus² mastery model:
    - Mastery levels 1-5 (Novice → Expert)
    - Criteria = specific, measurable competencies
    - Scenarios = realistic practice situations with a target difficulty
    - Dimensions map to distinct skill areas
    Return structured JSON.
    Use claude-sonnet-4-20250514 via Anthropic SDK.
    """

async def generate_course_from_files(
    file_ids: list[UUID],
    org_id: UUID,
    created_by: UUID,
    db: AsyncSession
) -> tuple[Course, IngestionJob]:
    """
    1. Create IngestionJob with status="queued"
    2. Return job immediately (processing happens async via ARQ)
    """
```

---

## Task 4: Async Ingestion Worker

### `/services/api/app/services/ingestion_worker.py`

Use ARQ (Redis already in docker-compose) for async processing:

```python
async def process_course_ingestion(ctx, job_id: str):
    """
    Full pipeline:
    1. Set status="extracting", progress=10
       - Read all CourseFiles from storage
       - Extract text (reuse rag_pipeline's file reading logic for PDF/DOCX/TXT)
    2. Set status="analyzing", progress=30
       - Concatenate extracted text
       - Call course_generator.analyze_content_for_course()
       - Store result in IngestionJob.ai_generated_metadata
    3. Set status="chunking", progress=50
       - Chunk text (reuse rag_pipeline._chunk_text)
       - Set chunks_total
    4. Set status="embedding", progress=70
       - Create Course record with source_type="uploaded", ai_generated_metadata
       - Generate embeddings per chunk (reuse rag_pipeline.embed_text)
       - Store ContentEmbedding records
       - Update chunks_processed as each chunk completes
    5. Set status="completed", progress=100
       - Link CourseFiles to the new Course
       - Set completed_at

    Progress stored in Redis for polling:
    key: f"ingestion:{job_id}:progress"
    value: JSON {status, progress_pct, current_step, ai_generated_metadata}

    On error: set status="failed", store error_message
    """
```

---

## Task 5: Admin API Routes

### `/services/api/app/routers/admin.py` (new router)

All routes require `org_admin` role. All queries scoped by `org_id` from JWT.

```
# ── File Upload ──
POST   /api/admin/upload              — Multipart upload, multiple files, returns CourseFile IDs
DELETE /api/admin/files/{file_id}     — Delete an uploaded file

# ── Course Generation ──
POST   /api/admin/courses/generate    — { file_ids: [...] } → IngestionJob
GET    /api/admin/ingestion/{job_id}  — Poll status from Redis → {status, progress, metadata}

# ── Course File Management ──
GET    /api/admin/courses/{id}/files  — List course files
POST   /api/admin/courses/{id}/files  — Upload additional files to course
DELETE /api/admin/courses/{id}/files/{file_id} — Remove file

# ── Course Publishing ──
POST   /api/admin/courses/{id}/publish   — Set published_at, status="active"
POST   /api/admin/courses/{id}/unpublish — Set published_at=null, status="draft"

# ── User Management ──
GET    /api/admin/users               — List org users + enrollment counts (NO mastery profiles — privacy!)
POST   /api/admin/users/invite        — { email, role } → create pending user
POST   /api/admin/users/bulk-import   — CSV multipart → validate → { valid: [...], errors: [...] }
PATCH  /api/admin/users/{id}/role     — { role } → update role

# ── Analytics ──
GET    /api/admin/analytics/overview  — Aggregate stats, weekly trends, level distribution, recent activity
GET    /api/admin/analytics/courses   — Per-course stats: enrolled, active, avg_level, completion, session_time

# ── Org Settings ──
PATCH  /api/admin/org/settings        — Update name, branding, SSO, defaults
```

Register in `main.py`.

**CRITICAL — Privacy enforcement**: Admin analytics routes must NEVER expose mastery profile data (thinking_patterns, knowledge_graph, pacing_preferences, conversation_summary). Admins see aggregate stats and enrollment status only. This is a core product principle.

---

## Task 6: Pydantic Schemas

### Create in `/services/api/app/schemas/`:

**`course_file.py`**:
- `CourseFileResponse`: id, course_id, original_filename, file_type, file_size, upload_status, created_at
- `UploadResponse`: files (list[CourseFileResponse])

**`ingestion.py`**:
- `GenerateCourseRequest`: file_ids (list[UUID])
- `IngestionJobResponse`: id, status, progress_pct, current_step, chunks_total, chunks_processed, ai_generated_metadata, error_message, created_at, completed_at

**`admin.py`**:
- `AdminUserResponse`: id, name, email, role, enrolled_courses_count, last_active, status
- `InviteUserRequest`: email, role
- `BulkImportRow`: name, email, role, program, valid, error
- `BulkImportResponse`: valid (list), errors (list), total, valid_count
- `AnalyticsOverviewResponse`: total_learners, active_learners, total_programs, avg_mastery_level, avg_completion_rate, weekly_sessions, level_distribution, recent_activity, top_programs
- `CourseAnalyticsResponse`: name, enrolled, active, avg_level, avg_completion, avg_session_time
- `UpdateOrgSettingsRequest`: name?, branding?, sso?, defaults?

**Update `course.py`**: Add source_type, ai_generated_metadata, published_at to CourseResponse.

---

## Task 7: Build Admin Frontend (apps/admin/)

### 7a. Rebuild the admin app

The current `apps/admin/` has basic scaffolding (4 pages with mock data). **Rebuild it** to match the Arena repo's admin UI (see "UI Reference" section above). Use Next.js App Router (same pattern as `apps/web/`).

Install the same dependencies the learner app uses: shadcn/ui, framer-motion, recharts, lucide-react.

Match the Arena design system:
- Primary color: `hsl(174, 42%, 40%)` (teal)
- Fonts: Inter (body), DM Sans (headings)
- Border radius: 0.75rem (lg), 0.625rem (md), 0.5rem (sm)
- Subtle animations: fade-in 0.4s, slide-in 0.3s

### 7b. Create admin API client

Replace the existing basic 25-line `apps/admin/src/lib/api-client.ts` with a full typed client:

```typescript
// apps/admin/src/lib/api-client.ts
export const adminApi = {
  // Analytics
  getOverview: () => authGet<AnalyticsOverview>("/api/admin/analytics/overview"),
  getCourseAnalytics: () => authGet<CourseAnalytics[]>("/api/admin/analytics/courses"),

  // Upload & Generate
  uploadFiles: (files: File[]) => authMultipart<UploadResponse>("/api/admin/upload", files),
  generateCourse: (fileIds: string[]) => authPost<IngestionJob>("/api/admin/courses/generate", { file_ids: fileIds }),
  pollIngestion: (jobId: string) => authGet<IngestionJob>(`/api/admin/ingestion/${jobId}`),

  // Courses / Programs
  listCourses: () => authGet<Course[]>("/api/courses"),
  getCourse: (id: string) => authGet<Course>(`/api/courses/${id}`),
  updateCourse: (id: string, data: Partial<Course>) => authPut<Course>(`/api/courses/${id}`, data),
  publishCourse: (id: string) => authPost(`/api/admin/courses/${id}/publish`),
  getCourseFiles: (id: string) => authGet<CourseFile[]>(`/api/admin/courses/${id}/files`),

  // Users
  listUsers: () => authGet<AdminUser[]>("/api/admin/users"),
  inviteUser: (data: { email: string; role: string }) => authPost("/api/admin/users/invite", data),
  bulkImport: (file: File) => authMultipart<BulkImportResponse>("/api/admin/users/bulk-import", [file]),

  // Settings
  getOrg: () => authGet<Organization>("/api/orgs/me"),
  updateSettings: (data: Partial<OrgSettings>) => authPatch("/api/admin/org/settings", data),
};
```

Include Auth0 token injection (or dev-mode mock token using the same `USE_MOCK` pattern as `apps/web/src/lib/auth.ts`).

### 7c. Wire each page to real APIs

- **AdminDashboard**: `adminApi.getOverview()` → stats, topPrograms, recentActivity
- **AdminPrograms**: `adminApi.listCourses()` → program cards
- **AdminProgramDetail**: `adminApi.getCourse(id)` + `getCourseFiles(id)` → scenarios, dimensions, materials
- **AdminUploadPipeline**: **Follow the "Upload UX Philosophy" section above.** Seamless drop → wait → review & publish. Use `adminApi.uploadFiles()` → `generateCourse()` → poll `pollIngestion()` until complete → show editable AI preview → `publishCourse()`. Hide all internal pipeline stages from the UI.
- **AdminUsers**: `adminApi.listUsers()` + real invite/import
- **AdminAnalytics**: `adminApi.getOverview()` + `getCourseAnalytics()` → chart data
- **AdminSettings**: `adminApi.getOrg()` → form values, save → `updateSettings()`

### 7d. Add loading & error states
- `Skeleton` components during data loading
- Error `Alert` on API failure with retry
- `toast` (sonner) on mutations (created, updated, deleted, etc.)

---

## Task 8: Tests

### Backend (`/services/api/tests/`):

The test infrastructure (conftest.py) is already set up with fixtures for `learner_client`, `admin_client`, `unauthenticated_client`, and seed data. Write:

- `test_admin_upload.py`: File type validation, size limits, tenant isolation, delete
- `test_course_generation.py`: Mock Claude → verify metadata structure, ingestion stages, polling
- `test_admin_routes.py`: RBAC (learner=403), tenant isolation, user list privacy, analytics aggregates
- `test_privacy.py`: Admin routes NEVER return thinking_patterns, knowledge_graph, pacing_preferences, or conversation_summary
- `test_existing_bugs.py`: Verify the bug fixes from Task 0 (RAG chunks work, voice auth works, enrollment count key is correct)

### Frontend (Vitest + RTL):
- Upload zone accepts files, pipeline progress updates, preview renders
- User table renders, search works, CSV import preview shows

---

## Task 9: Docker & Config

```yaml
# Add to infra/docker-compose.yml
worker:
  build: ./services/api
  command: arq app.services.ingestion_worker.WorkerSettings
  environment:
    - REDIS_URL=redis://redis:6379
    - DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/nexus_mastery
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    - OPENAI_API_KEY=${OPENAI_API_KEY}
  depends_on:
    - redis
    - postgres
  volumes:
    - uploads_data:/app/uploads
```

Add to the existing api service:
- `UPLOAD_DIR=/app/uploads` environment variable
- `uploads_data:/app/uploads` volume mount

Add `uploads_data:` to the volumes section.

---

## Priority Order

1. **P0**: Task 0 — Fix existing bugs (15 min, removes landmines)
2. **P1**: Tasks 1-5 — Backend models, Alembic, services, routes (the engine)
3. **P2**: Tasks 6-7 — Schemas + build/wire admin frontend (makes UI functional)
4. **P3**: Task 8 — Tests
5. **P4**: Task 9 — Docker + config
