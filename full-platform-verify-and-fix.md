# Nexus² Full Platform — Verify and Fix Every Flow

> **THE RULE: Nothing is done until you've run it, seen it work, and shown the output. If it breaks, fix it. If it doesn't exist, build it. Every single step below must produce actual curl output, actual database results, or actual browser screenshots. No exceptions. No "this should work." PROVE IT.**

---

## CRITICAL BUG — Fix FIRST Before Anything Else

### Bug: `GET /api/programs/{id}` crashes — missing selectinload(Program.courses)

**File**: `/services/api/app/routers/programs.py`

The `get_program` (line 107) and `get_my_active_program` (line 129) queries load domains, milestones, and focus_sessions via selectinload, but NOT `Program.courses`. Then `_build_program_response` accesses `program.courses` on line 83, which triggers a lazy load inside an async session → `MissingGreenlet` crash → 500 error.

This breaks:
- The admin programs LIST page (it fetches detail for each program, all fail silently → shows "0 programs")
- The admin program DETAIL page (404 / crash when clicking a program)
- The learner dashboard's `getActiveProgram()` call

**Fix** — add `selectinload(Program.courses)` to BOTH queries:

```python
# In get_program (around line 110):
.options(
    selectinload(Program.domains).selectinload(Domain.capabilities),
    selectinload(Program.milestones),
    selectinload(Program.focus_sessions),
    selectinload(Program.courses),  # ADD THIS
)

# In get_my_active_program (around line 132):
.options(
    selectinload(Program.domains).selectinload(Domain.capabilities),
    selectinload(Program.milestones),
    selectinload(Program.focus_sessions),
    selectinload(Program.courses),  # ADD THIS
)
```

You also need to import Course at the top of programs.py if not already imported:
```python
from app.models.course import Course
```

**VERIFY after fixing:**
```bash
# This must return full program data, not 500/404:
curl -s http://localhost:8000/api/programs -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool

# Pick one program ID from the list, then:
curl -s http://localhost:8000/api/programs/<PROGRAM_ID> -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# MUST return full program with domains, milestones, focus_sessions, AND courses

# Active program for learner:
curl -s http://localhost:8000/api/programs/active/me -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
# MUST return full program data
```

### Bug 2: publishCourse uses regular string instead of template literal

**File**: `/apps/admin/src/lib/api-client.ts`, line 129

```typescript
// BROKEN — ${id} won't interpolate in a regular string
publishCourse: (id: string) => authRequest("/api/admin/courses/${id}/publish", { method: "POST" }),

// FIX — use backticks for template literal
publishCourse: (id: string) => authRequest(`/api/admin/courses/${id}/publish`, { method: "POST" }),
```

---

## Setup: Get the Platform Running

Before anything else, make sure the full stack is up:

```bash
# 1. Start infrastructure
cd infra && docker-compose up -d
# VERIFY: postgres and redis are healthy
docker-compose ps

# 2. Ensure all tables exist
cd ../services/api
python -c "
import asyncio
from app.core.database import Base, engine
from app.models import *

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('All tables created')
    await engine.dispose()

asyncio.run(create())
"

# 3. Run seed script
python seed.py
# VERIFY: prints org, admin, learner, courses, program info

# 4. Start the API server
uvicorn app.main:app --reload --port 8000 &

# 5. Verify health
curl http://localhost:8000/health
# MUST return: {"status": "ok"}
```

If ANY of the above fails, fix it before proceeding. The rest of this prompt assumes a running server with seed data.

---

## Flow 1: Upload → Generate Course → Publish

This is the admin's hero journey: drop files, AI creates a course.

### 1a. Create a test PDF

```bash
pip install reportlab --break-system-packages 2>/dev/null
python -c "
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import os

os.makedirs('./test_files', exist_ok=True)
c = canvas.Canvas('./test_files/strategic_leadership.pdf', pagesize=letter)
c.setFont('Helvetica', 14)
c.drawString(72, 750, 'Strategic Decision Making for Product Managers')
c.setFont('Helvetica', 11)

content = [
    '',
    'Chapter 1: Data-Driven Decision Frameworks',
    '',
    'Effective product managers use data to inform decisions. Key frameworks:',
    '',
    '1. RICE Scoring: Evaluate by Reach, Impact, Confidence, Effort.',
    '   Reach = users affected. Impact = needle movement (3=massive to 0.25=minimal).',
    '   Confidence = estimate certainty. Effort = person-months required.',
    '',
    '2. Opportunity Solution Trees: Map outcomes to opportunities to solutions.',
    '   Start with measurable outcome, identify opportunities via user research,',
    '   brainstorm solutions per opportunity, test assumptions.',
    '',
    '3. Cost of Delay: Quantify loss from inaction.',
    '   Urgent + high value = do first. Not urgent + high value = schedule.',
    '',
    'Chapter 2: Stakeholder Alignment',
    '',
    'Key techniques for alignment:',
    '- Pre-alignment: Meet individually before group decisions',
    '- Shared metrics: Agree on success criteria upfront',
    '- Decision logs: Document who decided what and why',
    '- Disagree and commit: Allow dissent but require commitment',
    '',
    'Chapter 3: Risk Assessment',
    '',
    'Product managers should:',
    '- Use pre-mortem analysis to identify risks early',
    '- Categorize risks by likelihood and impact',
    '- Create mitigation plans for high-likelihood risks',
    '- Use reversibility as a decision accelerator',
    '',
    'Chapter 4: Prioritization Under Uncertainty',
    '',
    'When data is incomplete:',
    '- Use weighted scoring with explicit criteria',
    '- Run small experiments before committing resources',
    '- Set kill criteria upfront — when do you stop?',
    '- Seek disconfirming evidence actively',
]

y = 720
for line in content:
    if y < 60:
        c.showPage()
        c.setFont('Helvetica', 11)
        y = 750
    c.drawString(72, y, line)
    y -= 16

c.save()
print('Test PDF created: ./test_files/strategic_leadership.pdf')
"
```

If reportlab fails to install, create a `.txt` file with the same content instead. The pipeline must handle both.

### 1b. Upload the file

```bash
curl -s -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -F "files=@test_files/strategic_leadership.pdf" | python -m json.tool
```

**MUST return**: JSON with `files` array containing at least one object with `id`, `original_filename`, `file_type: "pdf"`, `upload_status: "uploaded"`.

**Save the file_id** — you'll need it next.

If this fails: check file_storage.py, check UPLOAD_DIR exists, check CourseFile model, check the course_files table exists in DB.

### 1c. Generate course from the upload

```bash
curl -s -X POST http://localhost:8000/api/admin/courses/generate \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["<FILE_ID>"]}' | python -m json.tool
```

**MUST return**: IngestionJob with `id`, `status: "queued"` (or already progressing).

**Save the job_id.**

If this fails: likely the `file_ids` type mismatch bug — the code converts UUIDs to strings but the column expects UUIDs. Fix it.

### 1d. Poll until complete

```bash
# Poll every 3 seconds until done
for i in $(seq 1 20); do
  RESULT=$(curl -s http://localhost:8000/api/admin/ingestion/<JOB_ID> \
    -H "Authorization: Bearer dev:auth0|admin-james")
  STATUS=$(echo $RESULT | python -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "Poll $i: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo $RESULT | python -m json.tool
    break
  fi
  sleep 3
done
```

**MUST reach `status: "completed"`** with `ai_generated_metadata` containing title, description, mastery_criteria, scenarios, domains.

If it fails:
- Check `error_message` in the response
- Check if `extract_text_from_file()` is being used (not raw `open()`)
- Check if ANTHROPIC_API_KEY is set in `.env`
- Check if the background task is actually running (add logging)
- Check if `ContentEmbedding` records were created (RAG indexing)

### 1e. Verify course was created

```bash
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**MUST show** the AI-generated course with a real title and description (not "Untitled Course").

### 1f. Verify RAG embeddings exist

```bash
python -c "
import asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.content_embedding import ContentEmbedding

async def check():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery')
    factory = async_sessionmaker(engine, class_=AsyncSession)
    async with factory() as db:
        count = (await db.execute(select(func.count(ContentEmbedding.id)))).scalar()
        print(f'RAG embeddings in DB: {count}')
    await engine.dispose()

asyncio.run(check())
"
```

**MUST show > 0 embeddings.** If 0, the RAG indexing step in the ingestion pipeline is broken.

### 1g. Publish the course

```bash
curl -s -X POST http://localhost:8000/api/admin/courses/<COURSE_ID>/publish \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**MUST return** `{"status": "published"}`.

---

## Flow 2: Learner Enrollment

### 2a. Learner sees the published course

```bash
curl -s http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```

**MUST return** the course that was just published. If empty, the endpoint is not filtering correctly or the course isn't active.

### 2b. Learner enrolls

```bash
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>"}' | python -m json.tool
```

**MUST return** enrollment ID with `mastery_status: "not_started"`.

If this fails: check the enrollments router exists, is registered in main.py, and the endpoint validates the course is active.

### 2c. Verify mastery profile was auto-created (if it didn't exist)

```bash
curl -s http://localhost:8000/api/mastery/me/profile \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```

**MUST return** a mastery profile (either the seeded one or a newly auto-created one).

### 2d. Duplicate enrollment is rejected

```bash
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>"}'
```

**MUST return 409** with "Already enrolled" error.

### 2e. Enrollment in unpublished course is rejected

```bash
# Try to enroll in one of the seed draft courses (if any exist), or temporarily unpublish one
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<DRAFT_COURSE_ID>"}'
```

**MUST return 400** with "Cannot enroll in unpublished course".

---

## Flow 3: Full Session — Teach → Challenge → Complete

This is the core learning experience. A learner starts a session and Nexi teaches them using the uploaded course material.

### 3a. Create a conversation

```bash
curl -s -X POST http://localhost:8000/api/conversations \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>", "session_type": "guided_learning"}' | python -m json.tool
```

**MUST return** a conversation with `id`, `session_mode: "teach"`.

**Save the conversation_id.**

### 3b. Test WebSocket streaming

Write and run a Python script that connects to the WebSocket, sends a message, and verifies Nexi responds with teaching content from the uploaded PDF:

```python
import asyncio, json, websockets

async def test_session():
    uri = "ws://localhost:8000/api/conversations/<CONVERSATION_ID>/stream"
    async with websockets.connect(uri) as ws:
        # Send first message
        await ws.send(json.dumps({
            "type": "user_message",
            "content": "I want to learn about decision making frameworks for product managers"
        }))

        # Collect response
        full_response = ""
        mode = None
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                data = json.loads(msg)

                if data["type"] == "assistant_token":
                    full_response += data["content"]
                elif data["type"] == "assistant_complete":
                    print(f"\n=== NEXI RESPONSE ===")
                    print(data["content"][:500])
                    print(f"...(total {len(data['content'])} chars)")
                elif data["type"] == "scaffold_update":
                    mode = data["mode"]
                    print(f"\n=== SCAFFOLD ===")
                    print(f"Mode: {mode}")
                    print(f"Observation: {data['observation']}")
                    print(f"Consider: {data['consider']}")
                    break
                elif data["type"] == "message_received":
                    continue
                elif data["type"] == "error":
                    print(f"ERROR: {data['content']}")
                    break
            except asyncio.TimeoutError:
                print("TIMEOUT — no response in 30 seconds")
                break

        # VERIFY:
        assert mode == "teach", f"Expected mode 'teach', got '{mode}'"
        assert len(full_response) > 50, "Response too short — Nexi isn't generating content"

        # Check that Nexi is TEACHING (explaining), not just asking questions
        response_lower = full_response.lower()
        is_teaching = any(phrase in response_lower for phrase in [
            "rice", "framework", "scoring", "reach", "impact",
            "stakeholder", "decision", "prioritiz", "let me explain",
            "here's", "the key", "this means", "for example"
        ])
        print(f"\nContains course content: {is_teaching}")
        if not is_teaching:
            print("WARNING: Nexi may not be using RAG course content in teach mode")

asyncio.run(test_session())
```

**MUST show**:
1. Nexi responding with actual teaching content about decision frameworks (from the uploaded PDF)
2. Mode = "teach"
3. Response contains references to RICE scoring, stakeholder alignment, or other topics from the PDF

If Nexi responds with generic questions instead of teaching → the RAG pipeline isn't injecting course content, or the system prompt isn't being followed. Fix it.

### 3c. Test mode progression

Send multiple messages and verify the mode advances:

```python
import asyncio, json, websockets

async def test_progression():
    uri = "ws://localhost:8000/api/conversations/<CONVERSATION_ID>/stream"
    async with websockets.connect(uri) as ws:
        messages = [
            "Tell me about this",           # teach (1)
            "I see, go on",                 # teach (2)
            "That makes sense",             # teach (3)
            "Yes, I understand the basics", # check_understanding (4)
            "RICE scoring means...",        # check_understanding (5)
            "What about edge cases?",       # challenge (6)
        ]

        for i, msg in enumerate(messages):
            await ws.send(json.dumps({"type": "user_message", "content": msg}))
            mode = None
            while True:
                data = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if data["type"] == "scaffold_update":
                    mode = data["mode"]
                    print(f"Message {i+1}: mode={mode}")
                    break
                elif data["type"] in ("message_received", "assistant_token"):
                    continue
                elif data["type"] == "assistant_complete":
                    continue
                elif data["type"] == "error":
                    print(f"ERROR at message {i+1}: {data['content']}")
                    return

        # Note: exchange count includes previous messages from 3b
        # The exact mode at each point depends on total exchanges

asyncio.run(test_progression())
```

**MUST show** mode progressing from teach → check_understanding → challenge as exchange count increases.

### 3d. Complete the session

```bash
curl -s -X POST http://localhost:8000/api/conversations/<CONVERSATION_ID>/complete \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```

**MUST return** `{"status": "completed", "assessment": {...}}` with:
- `session_summary` (real text, not empty)
- `thinking_patterns_update`
- `knowledge_graph_update`
- `capability_assessments` (list with deltas)
- `strengths_observed`
- `areas_for_improvement`

If this fails: check ANTHROPIC_API_KEY, check session_assessment.py, check the endpoint loads mastery profile correctly.

### 3e. Verify mastery profile was updated

```bash
curl -s http://localhost:8000/api/mastery/me/profile \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```

**MUST show** `thinking_patterns` and `knowledge_graph` updated with data from the assessment (not empty dicts or the original seed values only).

---

## Flow 4: Voice TTS

### 4a. Test the TTS endpoint

```bash
curl -s -X POST http://localhost:8000/api/voice/tts \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"text": "Welcome to your learning session. Today we will explore decision making frameworks."}' \
  --output test_audio.mp3

ls -la test_audio.mp3
file test_audio.mp3
```

**MUST produce** a valid audio file > 1KB. If 0 bytes or error, check ELEVENLABS_API_KEY.

---

## Flow 5: Multi-Tenant Isolation

### 5a. Create second org

```python
import asyncio, uuid
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.organization import Organization, PlanTier
from app.models.user import User, UserRole

async def create_second_org():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery')
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        org2_id = uuid.uuid4()
        db.add(Organization(id=org2_id, name="Beta Corp", slug="beta-corp", plan_tier=PlanTier.starter))
        db.add(User(id=uuid.uuid4(), email="admin@beta.com", display_name="Sarah Kim",
                     role=UserRole.org_admin, org_id=org2_id, auth0_sub="auth0|admin-sarah"))
        db.add(User(id=uuid.uuid4(), email="tom@beta.com", display_name="Tom Park",
                     role=UserRole.learner, org_id=org2_id, auth0_sub="auth0|learner-tom"))
        await db.commit()
        print(f"Beta Corp created: {org2_id}")
    await engine.dispose()

asyncio.run(create_second_org())
```

### 5b. Verify isolation

Run ALL of these and check results:

```bash
# Acme admin cannot see Beta Corp courses
echo "=== Acme admin courses ==="
curl -s http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool

# Acme admin cannot see Beta Corp users
echo "=== Acme admin users ==="
curl -s http://localhost:8000/api/admin/users -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool

# Beta learner cannot see Acme courses
echo "=== Beta learner available courses ==="
curl -s http://localhost:8000/api/courses/me/available -H "Authorization: Bearer dev:auth0|learner-tom" | python -m json.tool

# Beta admin analytics shows only Beta data
echo "=== Beta admin analytics ==="
curl -s http://localhost:8000/api/admin/analytics/overview -H "Authorization: Bearer dev:auth0|admin-sarah" | python -m json.tool
```

**MUST verify**: No cross-org data leakage. Beta users see only Beta data. Acme users see only Acme data.

---

## Flow 6: Privacy — Admin Cannot See Mastery Profiles

### 6a. Admin tries to access learner's mastery profile

```bash
# Get Maria's user ID from the users list
MARIA_ID=$(curl -s http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer dev:auth0|admin-james" | \
  python -c "import sys,json; users=json.load(sys.stdin); print([u['id'] for u in users if 'maria' in u.get('email','').lower()][0])")

echo "Maria's ID: $MARIA_ID"

# Admin tries to access Maria's mastery profile directly
curl -s http://localhost:8000/api/mastery/$MARIA_ID/profile \
  -H "Authorization: Bearer dev:auth0|admin-james"
```

**MUST return 403** with "Access denied: mastery profiles are private to the learner".

### 6b. Admin analytics NEVER includes mastery profile data

```bash
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**VERIFY**: Response contains aggregate stats only. No `thinking_patterns`, `knowledge_graph`, `pacing_preferences`, or `conversation_summary` anywhere in the response.

### 6c. Admin user list has enrollment counts but NO mastery data

```bash
curl -s http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**VERIFY**: Each user has `enrolled_courses_count` but no mastery profile fields.

---

## Flow 7: Admin User Management

### 7a. Invite a new user

```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"email": "newlearner@acme.com", "role": "learner"}' | python -m json.tool
```

**MUST return** new user with `status: "invited"`.

### 7b. Duplicate invite is rejected

```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"email": "newlearner@acme.com", "role": "learner"}'
```

**MUST return 400** with "User with this email already exists".

### 7c. Learner cannot invite users

```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"email": "hacker@evil.com", "role": "org_admin"}'
```

**MUST return 403**.

### 7d. Bulk CSV import

```bash
echo "name,email,role
Alice Johnson,alice@acme.com,learner
Bob Smith,bob@acme.com,facilitator
,invalid-email,learner
Charlie Brown,charlie@acme.com,superadmin" > test_files/import.csv

curl -s -X POST http://localhost:8000/api/admin/users/bulk-import \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -F "file=@test_files/import.csv" | python -m json.tool
```

**MUST return**: `valid_count: 2` (Alice, Bob), `errors` containing the invalid email and invalid role rows.

---

## Flow 8: RBAC — Role-Based Access Control

### 8a. Learner cannot access admin endpoints

```bash
# Learner tries to upload
curl -s -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -F "files=@test_files/strategic_leadership.pdf"
# MUST return 403

# Learner tries to view admin analytics
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|learner-maria"
# MUST return 403

# Learner tries to list admin users
curl -s http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer dev:auth0|learner-maria"
# MUST return 403
```

### 8b. Unauthenticated requests are rejected

```bash
# No auth header
curl -s http://localhost:8000/api/courses
# MUST return 401 or 403

curl -s http://localhost:8000/api/auth/me
# MUST return 401 or 403
```

---

## Flow 9: Admin Analytics with Real Data

After completing Flows 1-3 (course created, learner enrolled, session completed), verify analytics reflect real data:

```bash
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**MUST show**:
- `total_learners` > 0
- `total_programs` > 0
- `top_programs` with real program names (not empty)
- Numbers should reflect actual DB state, not hardcoded values

```bash
curl -s http://localhost:8000/api/admin/analytics/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

**MUST show** the uploaded course with `enrolled` > 0.

---

## Flow 10: Authentication — Login/Logout for Admin and Learner

Right now both apps use hardcoded dev tokens. There is NO login page, NO Auth0 integration on the frontend, NO logout, and NO access control. Anyone with the URL can access everything. This must be fixed.

### 10a. Install Auth0 SDK in both apps

```bash
cd apps/web && npm install @auth0/nextjs-auth0
cd ../admin && npm install @auth0/nextjs-auth0
```

### 10b. Add Auth0 route handler to both apps

**File**: `apps/web/src/app/api/auth/[auth0]/route.ts`
**File**: `apps/admin/src/app/api/auth/[auth0]/route.ts`

```typescript
import { handleAuth } from "@auth0/nextjs-auth0";
export const GET = handleAuth();
```

This gives you `/api/auth/login`, `/api/auth/logout`, `/api/auth/callback`, `/api/auth/me` for free.

### 10c. Wrap both apps in UserProvider

**File**: `apps/web/src/app/layout.tsx`
**File**: `apps/admin/src/app/layout.tsx`

```typescript
import { UserProvider } from "@auth0/nextjs-auth0/client";

// Wrap the body content:
<UserProvider>
  {children}
</UserProvider>
```

### 10d. Add login gate

Both apps should check if the user is authenticated. If not, redirect to login.

**Admin app** — create a middleware or wrap pages:
```typescript
// apps/admin/src/middleware.ts
import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";
export default withMiddlewareAuthRequired();
export const config = { matcher: ["/((?!api/auth).*)"] };
```

**Learner app** — same pattern:
```typescript
// apps/web/src/middleware.ts
import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";
export default withMiddlewareAuthRequired();
export const config = { matcher: ["/((?!api/auth).*)"] };
```

### 10e. Pass Auth0 token to API calls

Update both API clients to get the real access token from Auth0 session instead of the hardcoded dev token:

**For server-side calls** (pages that fetch on the server):
```typescript
import { getAccessToken } from "@auth0/nextjs-auth0";
const { accessToken } = await getAccessToken();
```

**For client-side calls**: Create an API route that proxies requests with the token, or use the Auth0 token from the session.

### 10f. Auto-provision users on first login

**File**: `/services/api/app/middleware/auth.py`

When a valid JWT comes in but no User record exists, check for a pending invite:
```python
if not user:
    email = payload.get("email", "")
    invite_result = await db.execute(
        select(User).where(User.email == email, User.auth0_sub.startswith("auth0|pending-"))
    )
    invited_user = invite_result.scalar_one_or_none()

    if invited_user:
        invited_user.auth0_sub = auth0_sub
        invited_user.display_name = payload.get("name", invited_user.display_name)
        await db.commit()
        return invited_user
    else:
        raise HTTPException(403, "No account found. Contact your organization admin for an invite.")
```

This means ONLY invited users can access the app. If someone signs up with Auth0 but hasn't been invited, they get a 403.

### 10g. Add logout button to both apps

Admin app should have a logout button in the sidebar or top bar. Learner app should have one in the user menu. Both link to `/api/auth/logout`.

### 10h. Environment variables

Both apps need:
```
AUTH0_SECRET=<random-32-char-secret>
AUTH0_BASE_URL=http://localhost:3000       # or 3001 for admin
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_AUDIENCE=<api-audience>
```

### 10i. Dev mode toggle

Keep the `USE_MOCK` / `DEV_AUTH` mode working for local development. When `DEV_AUTH=true` on the backend and `NEXT_PUBLIC_USE_MOCK_DATA=true` on the frontend, bypass Auth0 and use the hardcoded dev tokens. In production, these are set to false.

### 10j. VERIFY

```bash
# With DEV_AUTH=false:
# Unauthenticated request should be rejected
curl -s http://localhost:8000/api/courses
# MUST return 401/403

# With DEV_AUTH=true (development):
# Dev token should still work
curl -s http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# MUST return courses

# On the frontend: visiting the admin app URL without being logged in should redirect to Auth0 login
# After login, the user should see the dashboard
# The logout button should clear the session and redirect to login
```

---

## After ALL Flows Pass

### Report card

Create a summary showing pass/fail for each flow:

```
Critical Bug: Program selectinload fix   [PASS/FAIL]
Critical Bug: publishCourse template     [PASS/FAIL]
Flow 1: Upload → Generate → Publish     [PASS/FAIL]
Flow 2: Learner Enrollment              [PASS/FAIL]
Flow 3: Full Session + Assessment       [PASS/FAIL]
Flow 4: Voice TTS                       [PASS/FAIL]
Flow 5: Multi-Tenant Isolation          [PASS/FAIL]
Flow 6: Privacy (Mastery Profiles)      [PASS/FAIL]
Flow 7: Admin User Management           [PASS/FAIL]
Flow 8: RBAC                            [PASS/FAIL]
Flow 9: Analytics with Real Data        [PASS/FAIL]
Flow 10: Auth Login/Logout              [PASS/FAIL]

Bugs found and fixed: [list each]
Remaining issues: [list any]
```

### What you MUST NOT do:

- Skip a flow because it "looks correct in the code"
- Report a flow as passing without showing actual curl output
- Ignore errors in background tasks — check the ingestion job status
- Leave broken flows and move on to new features
- Say "this should work" — those words are banned
