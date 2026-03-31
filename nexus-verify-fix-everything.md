# Nexus² — Fix, Verify, and Complete Every Flow

> **THE RULE: Nothing is done until you've run it, seen it work, and shown the output. "I wrote the code" is NOT done. "I ran it and here's the output" IS done. If it breaks, fix it. If it doesn't exist, build it. Show curl commands, responses, DB query results — PROOF it works. The words "this should work" are banned.**

---

## Part 1: Fix Known Bugs

Several bugs have already been fixed by the user:
- ✅ Embedding model switched back to OpenAI ada-002 (1536d) — `content_embedding.py` updated
- ✅ `publishCourse` template literal fixed in admin api-client.ts
- ✅ Program `courses` field set to `[]` in `_build_program_response` to avoid lazy-load crash
- ✅ `ingestion_job.py` status field changed to String(50)

### Remaining Bug: RAG pipeline `embed_text` function may still use local model

**File**: `/services/api/app/services/rag_pipeline.py`

Check if `embed_text()` still uses the local sentence-transformers model. If so, switch it back to OpenAI:

```python
import httpx

async def embed_text(text_input: str) -> list[float]:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={"input": text_input, "model": "text-embedding-ada-002"},
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]
```

Remove any `_model` / `_get_model()` / `sentence_transformers` references.

**File**: `/services/api/app/models/content_embedding.py`, line 21
```python
# CURRENT (wrong):
embedding = mapped_column(Vector(384))

# FIX:
embedding = mapped_column(Vector(1536))
```

**File**: `/services/api/app/services/rag_pipeline.py`

Replace the local sentence-transformers embed function with the OpenAI one:
```python
import httpx

async def embed_text(text_input: str) -> list[float]:
    """Generate embedding using OpenAI ada-002 (1536 dims)."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={"input": text_input, "model": "text-embedding-ada-002"},
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]
```

Remove the `_model` global and `_get_model()` function — they're for the local model.

**IMPORTANT**: After changing the vector dimension, you must recreate the `content_embeddings` table (or run a migration) since the column dimension changed from 384 to 1536. Any existing embeddings in the DB are invalid and should be deleted:
```sql
-- Run via psql or a script:
TRUNCATE content_embeddings;
-- Then recreate the table or run alembic upgrade
```

**VERIFY:**
```bash
python -c "
import asyncio
from app.services.rag_pipeline import embed_text

async def test():
    result = await embed_text('test embedding')
    print(f'Embedding dimensions: {len(result)}')
    assert len(result) == 1536, f'Expected 1536, got {len(result)}'
    print('PASS: OpenAI ada-002 working correctly')

asyncio.run(test())
"
```

### Bug 2: `GET /api/programs/{id}` crashes — missing selectinload(Program.courses)

**File**: `/services/api/app/routers/programs.py`

The `get_program` and `get_my_active_program` queries load domains, milestones, and focus_sessions but NOT `Program.courses`. Then `_build_program_response` accesses `program.courses`, which triggers a lazy load inside an async session → crash → 500 error.

This breaks:
- Admin programs list page (fetches detail for each program, all fail silently → "0 programs")
- Admin program detail page (crash when clicking a program)
- Learner dashboard `getActiveProgram()` call

**Fix** — add `selectinload(Program.courses)` to BOTH queries in `get_program` and `get_my_active_program`.

**VERIFY:**
```bash
curl -s http://localhost:8000/api/programs \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# MUST return list of programs, not 500

curl -s "http://localhost:8000/api/programs/<PICK_AN_ID>" \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# MUST return full program with domains, milestones, focus_sessions, AND courses

curl -s http://localhost:8000/api/programs/active/me \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
# MUST return full program data
```

### Bug 3: publishCourse uses regular string instead of template literal

**File**: `/apps/admin/src/lib/api-client.ts`
```typescript
// BROKEN:
publishCourse: (id: string) => authRequest("/api/admin/courses/${id}/publish", { method: "POST" }),
// FIX:
publishCourse: (id: string) => authRequest(`/api/admin/courses/${id}/publish`, { method: "POST" }),
```

---

## Part 2: Verify Every Flow End-to-End

### Setup

Make sure the stack is running:
```bash
cd infra && docker-compose up -d
cd ../services/api
# Recreate tables (needed after vector dimension change)
python -c "
import asyncio
from app.core.database import Base, engine
from app.models import *
async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print('All tables recreated')
    await engine.dispose()
asyncio.run(create())
"
python seed.py
uvicorn app.main:app --reload --port 8000 &
curl http://localhost:8000/health
# MUST return {"status": "ok"}
```

---

### Flow 1: Upload → Generate Course → Publish

**1a. Create a test file**
```bash
mkdir -p test_files
cat > test_files/strategic_leadership.txt << 'CONTENT'
Strategic Decision Making for Product Managers

Chapter 1: Data-Driven Decision Frameworks

Effective product managers use data to inform decisions rather than relying on intuition alone. The key frameworks include:

RICE Scoring: Evaluate features by Reach, Impact, Confidence, and Effort. Reach measures how many users will be affected per quarter. Impact measures how much this moves the needle, scored from Massive (3x) to Minimal (0.25x). Confidence reflects how sure you are about estimates. Effort is measured in person-months.

Opportunity Solution Trees: Map desired outcomes to opportunities to solutions. Start with a measurable outcome, identify opportunities through user research, then brainstorm solutions for each opportunity. Test assumptions before committing resources.

Cost of Delay: Quantify what you lose by NOT doing something. Urgent plus high value means do first. Not urgent plus high value means schedule. Urgent plus low value means delegate.

Chapter 2: Stakeholder Alignment

Aligning stakeholders requires understanding their motivations and constraints. Key techniques include pre-alignment (meeting individually before group decisions), shared metrics (agreeing on success criteria upfront), decision logs (documenting who decided what and why), and disagree-and-commit (allowing dissent but requiring commitment once decided).

Chapter 3: Risk Assessment

Every decision carries risk. Product managers should identify risks early using pre-mortem analysis, categorize risks by likelihood and impact, create mitigation plans for high-likelihood high-impact risks, and use reversibility as a decision accelerator since reversible decisions can be made faster.

Chapter 4: Prioritization Under Uncertainty

When data is incomplete, use weighted scoring with explicit criteria, run small experiments before committing resources, set kill criteria upfront to know when to stop, and seek disconfirming evidence actively rather than only looking for data that supports your hypothesis.
CONTENT
echo "Test file created"
```

**1b. Upload**
```bash
curl -s -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -F "files=@test_files/strategic_leadership.txt" | python -m json.tool
```
**MUST return** `files` array with `id`, `upload_status: "uploaded"`. Save the `file_id`.

**1c. Generate course**
```bash
curl -s -X POST http://localhost:8000/api/admin/courses/generate \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["<FILE_ID>"]}' | python -m json.tool
```
**MUST return** IngestionJob with `id` and `status`. Save `job_id`.

**1d. Poll until complete**
```bash
for i in $(seq 1 30); do
  RESULT=$(curl -s http://localhost:8000/api/admin/ingestion/<JOB_ID> \
    -H "Authorization: Bearer dev:auth0|admin-james")
  STATUS=$(echo $RESULT | python -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))")
  echo "Poll $i: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo $RESULT | python -m json.tool
    break
  fi
  sleep 3
done
```
**MUST reach `completed`** with `ai_generated_metadata` containing title, description, scenarios, domains.

**1e. Verify course exists**
```bash
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```
**MUST show** the AI-generated course.

**1f. Verify RAG embeddings**
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
        print(f'RAG embeddings: {count}')
        assert count > 0, 'NO EMBEDDINGS — RAG indexing is broken!'
    await engine.dispose()
asyncio.run(check())
"
```

**1g. Publish**
```bash
curl -s -X POST http://localhost:8000/api/admin/courses/<COURSE_ID>/publish \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

---

### Flow 2: Learner Enrollment

**2a. Learner sees published course**
```bash
curl -s http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```
**MUST return** the published course.

**2b. Learner enrolls**
```bash
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>"}' | python -m json.tool
```
**MUST return** enrollment with `mastery_status: "not_started"`.

**2c. Duplicate enrollment rejected**
```bash
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>"}'
```
**MUST return 409.**

---

### Flow 3: Full Session — Nexi Teaches From Uploaded Content

**3a. Create conversation**
```bash
curl -s -X POST http://localhost:8000/api/conversations \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>", "session_type": "guided_learning"}' | python -m json.tool
```
**MUST return** conversation with `id`. Save it.

**3b. WebSocket — verify Nexi teaches with real course content**
```python
import asyncio, json, websockets

async def test():
    uri = "ws://localhost:8000/api/conversations/<CONVERSATION_ID>/stream"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({
            "type": "user_message",
            "content": "I want to learn about decision making frameworks for product managers"
        }))
        full = ""
        mode = None
        while True:
            data = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if data["type"] == "assistant_token":
                full += data["content"]
            elif data["type"] == "assistant_complete":
                print(f"NEXI ({len(data['content'])} chars):")
                print(data["content"][:300])
            elif data["type"] == "scaffold_update":
                mode = data["mode"]
                print(f"\nMode: {mode}")
                break
            elif data["type"] == "error":
                print(f"ERROR: {data['content']}")
                break

        assert mode == "teach", f"Expected teach, got {mode}"
        # Check Nexi is using uploaded course content
        lower = full.lower()
        has_content = any(w in lower for w in ["rice", "stakeholder", "framework", "prioriti", "decision"])
        print(f"Uses course content: {has_content}")
        assert has_content, "Nexi is NOT teaching from uploaded content — RAG injection broken"

asyncio.run(test())
```

**3c. Complete session**
```bash
curl -s -X POST http://localhost:8000/api/conversations/<CONVERSATION_ID>/complete \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```
**MUST return** assessment with `session_summary`, `thinking_patterns_update`, `capability_assessments`.

**3d. Verify mastery profile updated**
```bash
curl -s http://localhost:8000/api/mastery/me/profile \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool
```
**MUST show** updated `thinking_patterns` and `knowledge_graph`.

---

### Flow 4: Voice TTS

```bash
curl -s -X POST http://localhost:8000/api/voice/tts \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"text": "Welcome to your learning session. Today we explore decision making."}' \
  --output test_audio.mp3
ls -la test_audio.mp3
```
**MUST produce** audio file > 1KB.

---

### Flow 5: Multi-Tenant Isolation

**5a. Create second org**
```python
import asyncio, uuid
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.organization import Organization, PlanTier
from app.models.user import User, UserRole

async def create():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery')
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        org2 = uuid.uuid4()
        db.add(Organization(id=org2, name="Beta Corp", slug="beta-corp", plan_tier=PlanTier.starter))
        db.add(User(id=uuid.uuid4(), email="admin@beta.com", display_name="Sarah Kim",
                     role=UserRole.org_admin, org_id=org2, auth0_sub="auth0|admin-sarah"))
        db.add(User(id=uuid.uuid4(), email="tom@beta.com", display_name="Tom Park",
                     role=UserRole.learner, org_id=org2, auth0_sub="auth0|learner-tom"))
        await db.commit()
        print(f"Beta Corp: {org2}")
    await engine.dispose()
asyncio.run(create())
```

**5b. Verify isolation**
```bash
# Acme admin CANNOT see Beta users
curl -s http://localhost:8000/api/admin/users -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# MUST contain only Acme users

# Beta learner CANNOT see Acme courses
curl -s http://localhost:8000/api/courses/me/available -H "Authorization: Bearer dev:auth0|learner-tom" | python -m json.tool
# MUST NOT contain Acme courses

# Beta admin analytics shows only Beta data
curl -s http://localhost:8000/api/admin/analytics/overview -H "Authorization: Bearer dev:auth0|admin-sarah" | python -m json.tool
# MUST show Beta stats only
```

---

### Flow 6: Privacy — Admin Cannot See Mastery Profiles

```bash
# Get Maria's user ID
MARIA_ID=$(curl -s http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer dev:auth0|admin-james" | \
  python -c "import sys,json; users=json.load(sys.stdin); print([u['id'] for u in users if 'maria' in u.get('email','')][0])")

# Admin tries to read Maria's mastery profile
curl -s http://localhost:8000/api/mastery/$MARIA_ID/profile \
  -H "Authorization: Bearer dev:auth0|admin-james"
```
**MUST return 403** — "Access denied: mastery profiles are private to the learner".

---

### Flow 7: Admin User Management

**7a. Invite**
```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"email": "new@acme.com", "role": "learner"}' | python -m json.tool
```
**MUST return** user with `status: "invited"`.

**7b. Duplicate rejected**
```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"email": "new@acme.com", "role": "learner"}'
```
**MUST return 400.**

**7c. Learner cannot invite**
```bash
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"email": "hacker@evil.com", "role": "org_admin"}'
```
**MUST return 403.**

**7d. CSV bulk import**
```bash
echo "name,email,role
Alice,alice@acme.com,learner
Bob,bob@acme.com,facilitator
,bad-email,learner
Charlie,charlie@acme.com,superadmin" > test_files/import.csv

curl -s -X POST http://localhost:8000/api/admin/users/bulk-import \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -F "file=@test_files/import.csv" | python -m json.tool
```
**MUST return** `valid_count: 2`, errors for bad email and invalid role.

---

### Flow 8: RBAC

```bash
# Learner cannot access admin endpoints
curl -s -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|learner-maria" -F "files=@test_files/strategic_leadership.txt"
# MUST return 403

curl -s http://localhost:8000/api/admin/users -H "Authorization: Bearer dev:auth0|learner-maria"
# MUST return 403

# No auth header at all
curl -s http://localhost:8000/api/courses
# MUST return 401 or 403
```

---

### Flow 9: Analytics with Real Data

```bash
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```
**MUST show** `total_learners > 0`, `total_programs > 0`, real program names in `top_programs`.

---

## Part 3: Build Auth Login/Logout

Both apps currently use hardcoded dev tokens. There's no login page, no logout, and anyone with the URL can access everything. Fix this.

### Auth Requirements:

1. **Install Auth0 Next.js SDK** in both `apps/web` and `apps/admin`:
   ```bash
   cd apps/web && npm install @auth0/nextjs-auth0
   cd ../admin && npm install @auth0/nextjs-auth0
   ```

2. **Add Auth0 API route handler** to both apps at `src/app/api/auth/[auth0]/route.ts`:
   ```typescript
   import { handleAuth } from "@auth0/nextjs-auth0";
   export const GET = handleAuth();
   ```

3. **Wrap both apps in UserProvider** from `@auth0/nextjs-auth0/client` in their layout.tsx.

4. **Add login middleware** — unauthenticated users redirect to Auth0 login:
   ```typescript
   // src/middleware.ts
   import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";
   export default withMiddlewareAuthRequired();
   export const config = { matcher: ["/((?!api/auth).*)"] };
   ```

5. **Pass real Auth0 token to API calls** instead of hardcoded dev token.

6. **Auto-provision invited users** — in `/services/api/app/middleware/auth.py`, when a valid JWT comes in but no User record exists, check for a pending invite by email. If found, link the invite to the Auth0 identity. If not found, return 403 "Contact your admin for an invite."

7. **Add logout button** to both apps (sidebar/top bar → links to `/api/auth/logout`).

8. **Keep dev mode working** — when `DEV_AUTH=true` / `NEXT_PUBLIC_USE_MOCK_DATA=true`, bypass Auth0 and use dev tokens. Production sets these to false.

9. **Environment variables** for both apps:
   ```
   AUTH0_SECRET=<random-32-char-secret>
   AUTH0_BASE_URL=http://localhost:3000
   AUTH0_ISSUER_BASE_URL=https://<auth0-domain>
   AUTH0_CLIENT_ID=<client-id>
   AUTH0_CLIENT_SECRET=<client-secret>
   AUTH0_AUDIENCE=<api-audience>
   ```

**VERIFY:**
```bash
# Dev mode still works:
curl -s http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# MUST return courses

# Without auth:
curl -s http://localhost:8000/api/courses
# MUST return 401/403

# Frontend: visiting admin URL without login → redirects to Auth0
# After login → sees dashboard
# Logout button → clears session, redirects to login
```

---

## Report Card

After completing everything, produce this summary with ACTUAL results:

```
Bug 1: Embedding model → OpenAI 1536d     [PASS/FAIL]
Bug 2: Program selectinload fix            [PASS/FAIL]
Bug 3: publishCourse template literal      [PASS/FAIL]
Flow 1: Upload → Generate → Publish        [PASS/FAIL]
Flow 2: Learner Enrollment                 [PASS/FAIL]
Flow 3: Full Session + RAG Teaching        [PASS/FAIL]
Flow 4: Voice TTS                          [PASS/FAIL]
Flow 5: Multi-Tenant Isolation             [PASS/FAIL]
Flow 6: Privacy (Mastery Profiles)         [PASS/FAIL]
Flow 7: Admin User Management              [PASS/FAIL]
Flow 8: RBAC                               [PASS/FAIL]
Flow 9: Analytics with Real Data           [PASS/FAIL]
Auth: Login/Logout working                 [PASS/FAIL]

Bugs found and fixed: [list]
Issues remaining: [list]
```

## What You MUST NOT Do:
- Skip a flow because "the code looks right"
- Report PASS without showing actual curl output or test results
- Ignore background task errors — poll the ingestion job and read the error_message
- Leave broken flows and move to new ones
- Say "this should work" — those words are banned
