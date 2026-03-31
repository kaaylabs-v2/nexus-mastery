# Mastery Platform — Master Fix Prompt v2 (Full Audit)

> **CONTEXT**: Full code audit (March 2026) found ~98 issues across backend, learner frontend, and admin frontend. This prompt fixes ALL of them in priority order. The previous master-fix-prompt.md was never applied — every issue persists.

> **THE RULE**: Fix → Run → Verify → Screenshot. No fix is done until you've seen it working in the browser or in curl output. The words "this should work" are BANNED.

> **YOUR INTERN** is redesigning the frontend UI. All Part A (backend) fixes apply regardless. Part B frontend fixes should be applied to whatever UI exists now — if your intern replaces the UI later, give them Part B as a checklist for their new code.

---

## PART A: Backend Fixes (Do These First — No Frontend Dependencies)

### A1. CRITICAL: Disable DEV_AUTH in production config

**File**: `services/api/app/core/config.py`
```python
# Line 16 — Change:
DEV_AUTH: bool = True

# To:
DEV_AUTH: bool = Field(default=False, description="NEVER True in production")
```

Also add environment-based override so dev mode only works locally:
```python
import os
DEV_AUTH: bool = os.getenv("DEV_AUTH", "false").lower() == "true"
```

**VERIFY**:
```bash
# Without DEV_AUTH=true env var, dev tokens should be rejected:
curl -X GET http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# Must return 401 Unauthorized
```

---

### A2. Add missing db.commit() calls — ALL locations

These are all write operations that update the database but never commit. Changes are silently lost.

**File**: `services/api/app/routers/admin.py`
```python
# publish_course — add before return
course.published_at = datetime.now(timezone.utc)
course.status = CourseStatus.active
await db.commit()  # ← ADD THIS
return {"status": "published"}

# unpublish_course — add before return
course.published_at = None
course.status = CourseStatus.draft
await db.commit()  # ← ADD THIS
return {"status": "draft"}

# change_user_role — add before return
target.role = UserRole(role)
await db.commit()  # ← ADD THIS
return {"id": str(target.id), "role": role}

# update_org_settings — add before return
await db.commit()  # ← ADD THIS
return {"status": "updated"}
```

**File**: `services/api/app/routers/programs.py`
```python
# DELETE /programs/{program_id} — add after db.delete
await db.delete(program)
await db.commit()  # ← ADD THIS

# POST /programs/{program_id}/domains — add after capability loop
for cap in domain_in.capabilities:
    db.add(Capability(...))
await db.commit()  # ← ADD THIS
```

**File**: `services/api/app/routers/courses.py`
```python
# DELETE /{course_id} — add after db.delete
await db.delete(course)
await db.commit()  # ← ADD THIS
```

**File**: `services/api/app/routers/enrollments.py`
```python
# unenroll — add after db.delete
await db.delete(enrollment)
await db.commit()  # ← ADD THIS
```

**File**: `services/api/app/routers/conversations.py`
```python
# add_message endpoint — add commit after flush
from sqlalchemy.orm.attributes import flag_modified

conversation.messages = messages
flag_modified(conversation, "messages")
await db.flush()
await db.commit()  # ← ADD THIS
await db.refresh(conversation)
```

**File**: `services/api/app/services/file_storage.py`
```python
# delete_file — add after db.delete
await db.delete(cf)
await db.commit()  # ← ADD THIS
```

**File**: `services/api/app/services/mastery_service.py`
```python
# update_mastery_profile — add commit
await db.flush()
await db.commit()  # ← ADD THIS
return profile
```

Also make all PUT/PATCH operations use explicit commits instead of relying on middleware:

**File**: `services/api/app/routers/programs.py` (PUT /{program_id})
**File**: `services/api/app/routers/orgs.py` (PUT /me)
**File**: `services/api/app/routers/courses.py` (PUT /{course_id})
— In all three: add `await db.commit()` after `await db.flush()`.

**VERIFY**:
```bash
# Publish a course and verify it persists after server restart
curl -X POST http://localhost:8000/api/admin/courses/<ID>/publish -H "Authorization: Bearer dev:auth0|admin-james"
# Restart server, then:
curl http://localhost:8000/api/courses/<ID> -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# status MUST be "active"
```

---

### A3. Fix WebSocket authentication — conversations stream

**File**: `services/api/app/routers/conversations.py`

The WebSocket endpoint at `/conversations/{conversation_id}/stream` accepts connections without verifying user ownership. Fix:

```python
@router.websocket("/{conversation_id}/stream")
async def conversation_stream(websocket: WebSocket, conversation_id: UUID):
    await websocket.accept()

    # Extract and verify token from query params or headers
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    try:
        payload = await verify_token(token)
        user = await get_user_from_payload(payload, db)
    except Exception:
        await websocket.close(code=4001, reason="Invalid auth token")
        return

    # Verify user owns this conversation
    conversation = (await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == user.id)  # ← ADD THIS CHECK
    )).scalar_one_or_none()

    if not conversation:
        await websocket.close(code=4004, reason="Conversation not found")
        return
    # ... rest of handler
```

---

### A4. Fix conversation_summary type inconsistency

**File**: `services/api/app/models/mastery_profile.py`
```python
# Ensure the type annotation matches usage:
conversation_summary: Mapped[list | None] = mapped_column(JSONB, default=list)
```

**File**: `services/api/app/routers/conversations.py` (complete_conversation)
```python
# Replace:
summaries = profile.conversation_summary or {}
if not isinstance(summaries, list):
    summaries = []

# With:
summaries = profile.conversation_summary or []
```

---

### A5. Fix text chunking infinite loop

**File**: `services/api/app/services/rag_pipeline.py`
```python
def _chunk_text(text_content: str) -> list[str]:
    if not text_content.strip():
        return []
    chunks = []
    start = 0
    text_len = len(text_content)
    while start < text_len:
        end = min(start + CHUNK_SIZE, text_len)
        chunk = text_content[start:end]
        if chunk.strip():
            chunks.append(chunk)
        if end >= text_len:
            break
        next_start = end - CHUNK_OVERLAP
        if next_start <= start:
            break  # Prevent infinite loop
        start = next_start
    return chunks
```

---

### A6. Fix RAG vector query

**File**: `services/api/app/services/rag_pipeline.py`

Replace the string-based embedding passing with proper pgvector usage:
```python
# Replace:
embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
result = await db.execute(
    text("SELECT ... ORDER BY embedding <=> :embedding"),
    {"embedding": embedding_str}
)

# With:
from pgvector.sqlalchemy import Vector
result = await db.execute(
    text("SELECT ... ORDER BY embedding <=> :embedding::vector"),
    {"embedding": str(query_embedding)}
)
```

---

### A7. Fix course creation not using authenticated org_id

**File**: `services/api/app/routers/courses.py`
```python
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
    await db.commit()
    await db.refresh(course)
    return course
```

---

### A8. Fix analytics showing wrong enrollment counts

**File**: `services/api/app/routers/admin.py` — analytics_overview

```python
top_programs = []
for p in programs[:5]:
    enrolled = (await db.execute(
        select(func.count(Enrollment.id))
        .join(Course, Enrollment.course_id == Course.id)
        .where(Course.program_id == p.id)
    )).scalar() or 0
    top_programs.append({
        "name": p.name,
        "enrolled": enrolled,
        "avg_progress": round(p.current_level / max(p.target_level, 0.1) * 100),
    })
```

---

### A9. Fix N+1 query in user listing

**File**: `services/api/app/routers/admin.py` — list_users (around line 306)

Replace per-user COUNT queries with a single JOIN:
```python
from sqlalchemy import func, outerjoin

# Replace the loop with:
stmt = (
    select(User, func.count(Enrollment.id).label("enrollment_count"))
    .outerjoin(Enrollment, Enrollment.user_id == User.id)
    .where(User.org_id == org_id)
    .group_by(User.id)
)
results = (await db.execute(stmt)).all()
users = [
    {**user_to_dict(user), "enrollment_count": count}
    for user, count in results
]
```

---

### A10. Fix mutable defaults in SQLAlchemy models

Replace `default=dict` and `default=list` with factory functions across all models:

**Files**: All model files in `services/api/app/models/`
```python
# Replace:
field: Mapped[dict | None] = mapped_column(JSONB, default=dict)

# With:
from sqlalchemy import text as sa_text
field: Mapped[dict | None] = mapped_column(JSONB, server_default=sa_text("'{}'::jsonb"))

# Or use default_factory pattern:
field: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
```

Apply to: mastery_profile.py (6 fields), organization.py (1 field), conversation.py (1 field), content_embedding.py (1 field), course.py (1 field).

---

### A11. Fix _build_messages corrupting history

**File**: `services/api/app/services/nexi_engine.py`
```python
messages = []
for msg in conversation_history:
    role = msg.get("role", "user")
    if role not in ("user", "assistant"):
        continue
    content = msg.get("content", "")
    if not content.strip():
        continue
    messages.append({"role": role, "content": content})
```

---

### A12. Add Nexi system prompt improvements

**File**: `services/api/app/services/nexi_engine.py`

Add after the `CURRENT SESSION MODE` line in `_build_messages`:
```python
system_parts.append("""

IMPORTANT RULES:
1. If the learner explicitly asks you to teach, explain, or give an example, ALWAYS respond by teaching.
2. NEVER give the same response twice. Every response must be unique and contextual.
3. Format your teaching clearly: use short paragraphs (2-3 sentences each), not walls of text.
4. Do NOT output raw markdown syntax (no # or ## or ** in your responses). Write in clean prose.
5. When teaching, break complex topics into 3-5 digestible points. Pause for the learner to process.
6. Always reference the specific course material when available — don't give generic responses.""")
```

---

### A13. Fix ingestion error handling

**File**: `services/api/app/routers/admin.py` — _run_ingestion

Replace silent error swallowing with logging:
```python
import logging
logger = logging.getLogger(__name__)

# Replace: except Exception: continue
# With:
except Exception as e:
    logger.error(f"Failed to embed chunk {i} of file {file.id}: {e}")
    failed_chunks += 1
    continue

# After the loop:
if failed_chunks > 0:
    logger.warning(f"Ingestion completed with {failed_chunks} failed chunks out of {total_chunks}")
    job.status = "completed_with_errors"
    job.error_message = f"{failed_chunks}/{total_chunks} chunks failed to embed"
else:
    job.status = "completed"
await db.commit()
```

---

### A14. Fix email validation in bulk import

**File**: `services/api/app/routers/admin.py` — bulk_import_users

```python
import re
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Replace: if "@" not in email
# With:
if not EMAIL_REGEX.match(email.strip()):
    errors.append(f"Row {i}: Invalid email format: {email}")
    continue
```

---

### A15. Fix CORS configuration

**File**: `services/api/app/main.py`
```python
# Replace:
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# With:
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Org-ID"],
)
```

---

### A16. Add file upload validation

**File**: `services/api/app/routers/admin.py` — upload endpoint

```python
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".pptx", ".xlsx", ".csv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

@router.post("/upload")
async def upload_file(file: UploadFile, ...):
    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type {ext} not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB")
    await file.seek(0)
    # ... rest of upload
```

---

### A17. Add request timeout handling for Anthropic API

**File**: `services/api/app/services/nexi_engine.py`

```python
import httpx
from anthropic import APITimeoutError, RateLimitError

try:
    response = await client.messages.create(...)
except APITimeoutError:
    raise HTTPException(504, "AI service timed out. Please try again.")
except RateLimitError:
    raise HTTPException(429, "AI service is busy. Please wait a moment and try again.")
except Exception as e:
    logger.error(f"Anthropic API error: {e}")
    raise HTTPException(502, "AI service is temporarily unavailable.")
```

---

## PART B: Frontend Fixes (Apply to Current UI — Give as Checklist to Intern)

### B1. Remove hardcoded dev tokens from source code

**File**: `apps/web/src/lib/api-client.ts`
**File**: `apps/admin/src/lib/api-client.ts`

```typescript
// Remove any hardcoded tokens like:
// "dev:auth0|learner-maria", "dev:auth0|admin-james"
// Replace with:
const token = await getAccessToken(); // from Auth0
if (!token) throw new Error("Not authenticated");
```

---

### B2. Replace hardcoded session-1 links with dynamic session creation

**File**: `apps/web/src/app/page.tsx`

Replace ALL `href="/session/session-1"` with a function that creates a real conversation:

```typescript
const [startingSession, setStartingSession] = useState(false);
const router = useRouter();

const handleStartSession = async (courseId?: string) => {
  setStartingSession(true);
  try {
    const targetCourse = courseId || enrolledCourses[0]?.id;
    if (!targetCourse) {
      router.push("/courses");
      return;
    }
    const conv = await apiClient.createConversation(targetCourse);
    router.push(`/session/${conv.id}`);
  } catch (e) {
    console.error("Failed to start session:", e);
    router.push("/courses");
  } finally {
    setStartingSession(false);
  }
};
```

Replace `<Link href="/session/session-1">` at lines 95 and 219 with `<button onClick={() => handleStartSession()}>`.

---

### B3. Render markdown properly in chat messages

**File**: `apps/web/src/app/session/[id]/page.tsx`

```bash
cd apps/web && npm install react-markdown @tailwindcss/typography
```

```tsx
import ReactMarkdown from "react-markdown";

// Replace: <p>{msg.content}</p>
// With:
<div className="prose prose-sm max-w-none text-foreground">
  <ReactMarkdown>{msg.content}</ReactMarkdown>
</div>
```

---

### B4. Fix [object Object] alert on enrollment

**File**: `apps/web/src/app/courses/page.tsx`

```typescript
// Replace: alert(String(e))
// With:
const message = e instanceof Error ? e.message : (e as any)?.detail || "Enrollment failed";
setError(message); // Use state, not alert()
```

**File**: `apps/web/src/lib/api-client.ts`
```typescript
// Throw proper Error objects:
const err = new Error(error.detail || "Request failed");
(err as any).status = response.status;
throw err;
```

---

### B5. Fix status badge labels

**File**: `apps/web/src/app/page.tsx`

```tsx
// Replace:
{skill.status === "critical" ? "Critical" : "Attention"}

// With:
{
  { critical: "Critical", attention: "Attention", proficient: "Proficient", advanced: "Advanced" }
  [skill.status] || skill.status
}
```

---

### B6. Remove silent mock data fallback

**File**: `apps/web/src/contexts/LearnerContext.tsx`

```typescript
// Replace: console.info("API failed, using mock data"); return MOCK_DATA;
// With:
console.error("API failed:", error);
setError("Failed to load your data. Please check your connection and try again.");
setLoading(false);
// Do NOT fall back to mock data — show the error
```

---

### B7. Fix broken links and dead buttons

**File**: `apps/web/src/components/layout/sidebar.tsx`
- Remove links to Analytics, Journal, Profile until those pages are implemented

**File**: `apps/web/src/app/session/[id]/page.tsx`
- Either implement the Lightbulb/Search/Bell buttons or remove them

**File**: `apps/web/src/components/ui/mastery-card.tsx`
- Fix the `/sessions` link to point to a real route

---

### B8. Fix admin: Add logout button

**File**: `apps/admin/src/components/admin-sidebar.tsx`

The `LogOut` icon is imported but never rendered. Add:
```tsx
<button onClick={() => signOut()} className="flex items-center gap-2 p-2 text-red-500 hover:bg-red-50 rounded">
  <LogOut size={18} />
  <span>Sign Out</span>
</button>
```

---

### B9. Fix admin: Real upload progress

**File**: `apps/admin/src/app/upload/page.tsx`

Replace the fake timer-based progress with real API polling:
```typescript
// Replace: setTimeout(() => setStep(step + 1), 2500)
// With:
const pollIngestionStatus = async (jobId: string) => {
  const interval = setInterval(async () => {
    try {
      const status = await apiClient.getIngestionStatus(jobId);
      setProgress(status.progress);
      setStep(status.current_step);
      if (status.status === "completed" || status.status === "failed") {
        clearInterval(interval);
        if (status.status === "failed") setError(status.error_message);
      }
    } catch (e) {
      clearInterval(interval);
      setError("Lost connection to server");
    }
  }, 3000);
};
```

---

### B10. Fix admin: Settings page — remove fake data

**File**: `apps/admin/src/app/settings/page.tsx`

Replace hardcoded mock API keys and webhooks with real API calls:
```typescript
useEffect(() => {
  apiClient.getOrgSettings().then(setSettings).catch(setError);
}, []);

const handleSave = async () => {
  try {
    await apiClient.updateOrgSettings(settings);
    setSuccess("Settings saved");
  } catch (e) {
    setError("Failed to save settings");
  }
};
```

---

### B11. Fix admin: Analytics page — use real data

**File**: `apps/admin/src/app/analytics/page.tsx`

Replace all hardcoded static data with API calls:
```typescript
useEffect(() => {
  apiClient.getAnalyticsOverview().then(setData).catch(setError);
}, []);
```

---

### B12. Fix admin: Hardcoded email in sidebar

**File**: `apps/admin/src/components/admin-sidebar.tsx`

```typescript
// Replace: "admin@acme.com"
// With: user?.email || "Loading..."
```

---

### B13. Add request timeouts to all fetch calls

**Files**: `apps/web/src/lib/api-client.ts`, `apps/admin/src/lib/api-client.ts`

```typescript
// Add AbortController timeout to every fetch:
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

try {
  const response = await fetch(url, { ...options, signal: controller.signal });
  // ...
} catch (e) {
  if (e instanceof DOMException && e.name === 'AbortError') {
    throw new Error('Request timed out. Please try again.');
  }
  throw e;
} finally {
  clearTimeout(timeout);
}
```

---

### B14. Add error states to ALL pages

Every page that fetches data needs 3 states: loading, data, error. Replace all `.catch(console.error)` and `.catch(() => {})`:

```typescript
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  fetchData()
    .then(setData)
    .catch((e) => setError(e?.message || "Failed to load"))
    .finally(() => setLoading(false));
}, []);

// In JSX:
{error && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    {error}
    <button onClick={retry} className="ml-2 underline">Retry</button>
  </div>
)}
```

Apply to: admin dashboard, programs list, program detail, users, analytics, settings, learner dashboard, courses page.

---

### B15. Fix admin: "New Program" button

**File**: `apps/admin/src/app/programs/page.tsx`

Add onClick handler:
```tsx
<button onClick={() => setShowCreateModal(true)}>
  New Program
</button>
```

---

## PART C: Infrastructure & Config

### C1. Remove .env.local files from git tracking

```bash
echo "apps/web/.env.local" >> .gitignore
echo "apps/admin/.env.local" >> .gitignore
git rm --cached apps/web/.env.local apps/admin/.env.local
```

Create `.env.local.example` files instead with placeholder values.

### C2. Add upload polling with exponential backoff

**File**: `apps/admin/src/app/upload/page.tsx`
```typescript
const pollWithBackoff = async (jobId: string, attempt = 0) => {
  const maxAttempts = 20;
  const delay = Math.min(2000 * Math.pow(1.5, attempt), 30000); // Max 30s

  if (attempt >= maxAttempts) {
    setError("Upload timed out. Check the admin dashboard for status.");
    return;
  }

  const status = await apiClient.getIngestionStatus(jobId);
  if (status.status === "completed" || status.status === "failed") return;

  setTimeout(() => pollWithBackoff(jobId, attempt + 1), delay);
};
```

---

## PART D: Playwright Tests

After all fixes are applied, write and run these tests. **Every test must pass.**

### D1. Basic Navigation (both apps)
```typescript
// apps/admin/e2e/navigation.spec.ts
// Click every sidebar link → verify no crashes, no blank pages, no 404s
```

### D2. Programs CRUD
```typescript
// apps/admin/e2e/programs.spec.ts
// List programs → verify count > 0 → click program → verify detail loads
// Click "New Program" → verify modal/form opens
```

### D3. User Management
```typescript
// apps/admin/e2e/users.spec.ts
// List users → verify table renders → change role → verify it persists
```

### D4. Session (Learner)
```typescript
// apps/web/e2e/session.spec.ts
// Start session → verify real conversation created (not session-1) →
// Nexi responds → response is formatted (no raw markdown) → response is unique
```

### D5. Enrollment
```typescript
// apps/web/e2e/enrollment.spec.ts
// Go to courses → enroll → verify no [object Object] → course moves to enrolled list
```

### D6. Error Handling
```typescript
// apps/web/e2e/error-handling.spec.ts
// Kill API → load dashboard → verify error message shown (not mock data)
// Restart API → click retry → verify data loads
```

### D7. Cross-App Flow (THE MOST IMPORTANT)
```typescript
// apps/admin/e2e/cross-app.spec.ts
// Admin uploads file → generates course → publishes →
// Learner enrolls → starts session → asks about uploaded content →
// Verify Nexi's response references the uploaded material
```

Run ALL tests:
```bash
cd apps/admin && npx playwright test --headed
cd ../web && npx playwright test --headed
```

---

## VERIFY CHECKLIST

Before marking this done, every item must be checked:

**Security:**
- [ ] DEV_AUTH is False by default — dev tokens rejected without env var
- [ ] No hardcoded tokens in frontend source code
- [ ] .env.local files not tracked in git
- [ ] WebSocket verifies user owns the conversation
- [ ] CORS is restricted to specific methods/headers
- [ ] File uploads validated for type and size

**Data Integrity:**
- [ ] Publish course → restart server → still published (commit works)
- [ ] Delete program → restart → actually deleted
- [ ] Delete course → restart → actually deleted
- [ ] Enroll → unenroll → re-enroll (all commits work)
- [ ] Change user role → verify persists
- [ ] conversation_summary is always a list, never a dict
- [ ] Analytics shows real per-program enrollment counts

**Learner Frontend:**
- [ ] "Enter Arena" creates REAL conversation (not session-1)
- [ ] Nexi's response is rendered with proper formatting
- [ ] Nexi gives unique, contextual responses
- [ ] Enrollment works without [object Object]
- [ ] Status badges show correct labels
- [ ] No silent fallback to mock data — errors are shown
- [ ] Sidebar only links to real pages
- [ ] No dead buttons

**Admin Frontend:**
- [ ] Logout button works
- [ ] Upload shows real progress
- [ ] Settings page loads real org settings
- [ ] Analytics uses real API data
- [ ] Sidebar shows real user email
- [ ] "New Program" button works
- [ ] Users page loads without N+1 queries

**Tests:**
- [ ] All 7 Playwright test suites pass in headed mode
- [ ] Cross-app test proves uploaded content appears in Nexi's teaching

## DO NOT:
- Fix one thing and move to the next without verifying
- Write Playwright tests that silently skip steps
- Say "this should work" — run it and prove it
- Leave any `.catch(console.error)` or `.catch(() => {})` in the codebase
- Leave `DEV_AUTH = True` anywhere
