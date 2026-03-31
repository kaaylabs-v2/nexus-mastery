# Phase 4: Admin Studio Backend + Integration — Claude Code Prompt

> **Context**: Nexus² Mastery Platform. Phases 1-3 built the backend (FastAPI + PostgreSQL/pgvector + Redis), the learner frontend (Next.js 16), Socratic AI engine (Claude Sonnet/Haiku), RAG pipeline, Auth0 JWT auth, and voice service (Deepgram + ElevenLabs). The Arena repo (`personal-arena`) already has a comprehensive Admin Studio **frontend** with 7 pages using the Arena design system (shadcn/ui, Framer Motion, Recharts, Lucide icons). Phase 4 builds the **backend services** to power it and **wires** the frontend to real APIs.

---

## What Already Exists

### Admin Frontend (Arena repo — `/src/pages/admin/` — DONE, needs API wiring)

| Page | File | What It Does | What It Needs |
|------|------|-------------|---------------|
| Layout | `AdminLayout.tsx` + `AdminSidebar.tsx` + `AdminTopBar.tsx` | shadcn Sidebar, 6 nav items, "Arena Studio" branding | Auth0 token in context, org name from API |
| Dashboard | `AdminDashboard.tsx` | StatCards (learners, programs, completion), Top Programs with progress bars, Recent Activity | Wire to `GET /api/admin/analytics/overview` |
| Programs | `AdminPrograms.tsx` | Card list with dimensions, scenario counts, learner counts, click → detail | Wire to `GET /api/courses` (or new programs endpoint) |
| Program Detail | `AdminProgramDetail.tsx` | 3 tabs (Scenarios/Dimensions/Materials), materials table with chunks, add/delete | Wire to `GET /api/courses/{id}`, files, chunks |
| Upload & Generate | `AdminUploadPipeline.tsx` | 5-stage pipeline UI (upload→extract→analyze→chunk→generate), AI preview with editable fields, mastery criteria | Wire to `POST /api/admin/upload`, `POST /api/admin/courses/generate`, poll `GET /api/admin/ingestion/{id}` |
| Users | `AdminUsers.tsx` | User table, search, CSV bulk import with preview/validation, invite | Wire to `GET /api/admin/users`, `POST /api/admin/users/invite`, `POST /api/admin/users/bulk-import` |
| Analytics | `AdminAnalytics.tsx` | Recharts (AreaChart sessions, PieChart level distribution, BarChart program comparison), program breakdown table | Wire to `GET /api/admin/analytics/overview`, `GET /api/admin/analytics/courses` |
| Settings | `AdminSettings.tsx` | 4 tabs (General/SSO/API Keys/Webhooks), branding, SSO toggle with SAML, masked API keys | Wire to `GET /api/orgs/me`, `PATCH /api/admin/org/settings` |

### Backend (Already exists in `/services/api/`)
- **Course CRUD**: `GET/POST/PUT/DELETE /api/courses` with org_admin/facilitator role checks
- **Org management**: `GET/PUT /api/orgs/me`
- **Enrollment queries**: `GET /api/mastery/enrollments/org` and `/org/count`
- **RAG pipeline** (`rag_pipeline.py`): PDF/DOCX/TXT ingestion, chunking (1000/200 overlap), OpenAI ada-002 embeddings, pgvector search
- **Auth0 JWT + RBAC**: RS256 verification, JWKS caching, roles (learner, org_admin, facilitator)
- **Tenant isolation**: All queries scoped by org_id from JWT
- **Privacy enforcement**: Mastery profiles blocked from admin access

---

## Phase 4 Objectives

Build the **backend services** that power the Admin Studio frontend and **wire all 7 pages to real APIs**. The frontend is already built — this phase is about making it functional.

---

## Task 1: New Backend Models & Migrations

### 1a. `CourseFile` model (`/services/api/app/models/course_file.py`)
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

### 1b. `IngestionJob` model (`/services/api/app/models/ingestion_job.py`)
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

### 1c. Modify `Course` model — add fields:
```python
source_type: Enum("manual", "uploaded")  # default "manual"
ai_generated_metadata: JSONB (nullable)  # Claude's full analysis output
published_at: datetime (nullable)        # null = draft, set on publish
```

### 1d. Create Alembic migration for all model changes.
Register new models in `/services/api/app/models/__init__.py`.

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
GET    /api/admin/users               — List org users + enrollment counts (NO mastery profiles)
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

## Task 7: Wire Frontend to Real APIs

### 7a. Create API service with Auth0 token injection

```typescript
// /src/services/adminApi.ts
export const adminApi = {
  // Analytics
  getOverview: () => authGet("/api/admin/analytics/overview"),
  getCourseAnalytics: () => authGet("/api/admin/analytics/courses"),

  // Upload & Generate
  uploadFiles: (files: File[]) => authMultipart("/api/admin/upload", files),
  generateCourse: (fileIds: string[]) => authPost("/api/admin/courses/generate", { file_ids: fileIds }),
  pollIngestion: (jobId: string) => authGet(`/api/admin/ingestion/${jobId}`),

  // Courses / Programs
  listCourses: () => authGet("/api/courses"),
  getCourse: (id: string) => authGet(`/api/courses/${id}`),
  updateCourse: (id: string, data: any) => authPut(`/api/courses/${id}`, data),
  publishCourse: (id: string) => authPost(`/api/admin/courses/${id}/publish`),
  getCourseFiles: (id: string) => authGet(`/api/admin/courses/${id}/files`),

  // Users
  listUsers: () => authGet("/api/admin/users"),
  inviteUser: (data: {email: string, role: string}) => authPost("/api/admin/users/invite", data),
  bulkImport: (file: File) => authMultipart("/api/admin/users/bulk-import", [file]),

  // Settings
  getOrg: () => authGet("/api/orgs/me"),
  updateSettings: (data: any) => authPatch("/api/admin/org/settings", data),
};
```

### 7b. Replace mock data in each page with real API calls

- **AdminDashboard**: `adminApi.getOverview()` → stats, topPrograms, recentActivity
- **AdminPrograms**: `adminApi.listCourses()` → program cards
- **AdminProgramDetail**: `adminApi.getCourse(id)` + `getCourseFiles(id)` → scenarios, dimensions, materials
- **AdminUploadPipeline**: Real upload → generate → poll flow (replace `simulatePipeline`)
- **AdminUsers**: `adminApi.listUsers()` + real invite/import
- **AdminAnalytics**: `adminApi.getOverview()` + `getCourseAnalytics()` → chart data
- **AdminSettings**: `adminApi.getOrg()` → form values, save → `updateSettings()`

### 7c. Add loading & error states
- `Skeleton` components during loading
- Error `Alert` on API failure
- `toast` (sonner) on mutations

---

## Task 8: Tests

### Backend (`/services/api/tests/`):
- `test_admin_upload.py`: File type validation, size limits, tenant isolation, delete
- `test_course_generation.py`: Mock Claude → verify metadata structure, ingestion stages, polling
- `test_admin_routes.py`: RBAC (learner=403), tenant isolation, user list privacy, analytics aggregates
- `test_privacy.py` (extend): Admin routes NEVER return thinking_patterns, knowledge_graph, etc.

### Frontend (Vitest + RTL):
- Upload zone accepts files, pipeline progress updates, preview renders
- User table renders, search works, CSV import preview shows

---

## Task 9: Docker & Config

```yaml
# Add to docker-compose.yml
worker:
  build: ./services/api
  command: arq app.services.ingestion_worker.WorkerSettings
  environment:
    - REDIS_URL=redis://redis:6379
    - DATABASE_URL=postgresql+asyncpg://...
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    - OPENAI_API_KEY=${OPENAI_API_KEY}
  depends_on:
    - redis
    - postgres
```

- Add `UPLOAD_DIR=/app/uploads` + volume mount `./uploads:/app/uploads`
- Add `DEEPGRAM_API_KEY` to config.py (voice service uses it but it's missing from Settings)

---

## Priority Order

1. **P0**: Tasks 1-5 — Backend models, services, routes (the engine)
2. **P1**: Tasks 6-7 — Schemas + wire frontend to real APIs (makes UI functional)
3. **P2**: Task 8 — Tests
4. **P3**: Task 9 — Docker + config
