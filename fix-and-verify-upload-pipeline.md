# Fix and Verify Upload Pipeline — Claude Code Prompt

> **CRITICAL RULE: Do NOT mark anything done until you have actually run it and seen it work.** Write code → run it → see output → fix errors → repeat until it actually works. No exceptions.

---

## The Problem

The upload → generate course pipeline is broken. A user uploaded a PDF and tried to generate a course, and it failed. The code was written but never tested end-to-end.

## Your Job

Fix every issue in the upload → generate pipeline, then **prove it works** by running through the full flow yourself. You must create a test PDF, upload it via the API, generate a course from it, and verify the course was created with RAG-indexed content.

---

## Step 1: Ensure Database Tables Exist

The `course_files`, `ingestion_jobs`, and `content_embeddings` tables may not exist. Check and create them:

```bash
cd services/api
# Check if tables exist
python -c "
import asyncio
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

async def check():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery')
    async with engine.connect() as conn:
        def get_tables(conn):
            return inspect(conn).get_table_names()
        tables = await conn.run_sync(get_tables)
        print('Existing tables:', tables)
    await engine.dispose()

asyncio.run(check())
"
```

If tables are missing, either run `alembic upgrade head` or create them:

```python
# Quick fix: create all tables
python -c "
import asyncio
from app.core.database import Base, engine
from app.models import *  # Import all models so they register

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('All tables created')
    await engine.dispose()

asyncio.run(create())
"
```

## Step 2: Fix Known Bugs

### Bug 1: file_ids stored as strings instead of UUIDs
**File**: `/services/api/app/routers/admin.py`, line 236

```python
# BROKEN — converts UUIDs to strings, but column is ARRAY(UUID)
file_ids=[str(fid) for fid in data.file_ids],

# FIX — keep as UUID objects
file_ids=data.file_ids,
```

### Bug 2: _run_ingestion uses text-only file reading for PDFs
**File**: `/services/api/app/routers/admin.py`, around line 88-96

Check if the ingestion function uses `extract_text_from_file()` from rag_pipeline. If it still uses raw `open(file_path, "r")`, fix it:

```python
from app.services.rag_pipeline import extract_text_from_file

# Replace the file reading loop with:
all_text = ""
for fid in file_ids:
    cf_result = await db.execute(select(CourseFile).where(CourseFile.id == fid))
    cf = cf_result.scalar_one_or_none()
    if cf:
        file_path = os.path.join(settings.UPLOAD_DIR, cf.storage_path)
        if os.path.exists(file_path):
            try:
                all_text += extract_text_from_file(file_path) + "\n\n"
            except Exception as e:
                job.error_message = f"Failed to read {cf.original_filename}: {str(e)}"
```

### Bug 3: Background task error handling
The `_run_ingestion` function catches exceptions and sets `status=failed`, but if the function itself fails to start (e.g., the session factory fails), there's no error feedback. Add logging:

```python
import logging
logger = logging.getLogger(__name__)

# At the top of _run_ingestion:
logger.info(f"Starting ingestion job {job_id} with {len(file_ids)} files")

# In the except block:
logger.error(f"Ingestion job {job_id} failed: {e}", exc_info=True)
```

## Step 3: Create a Test PDF and Run the Pipeline

**You MUST do this. Do not skip this step.**

### 3a. Create a test PDF
```python
# Create a simple test PDF about a topic
python -c "
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import os

os.makedirs('./test_files', exist_ok=True)
c = canvas.Canvas('./test_files/test_course.pdf', pagesize=letter)
c.setFont('Helvetica', 12)

content = '''Strategic Decision Making for Product Managers

Chapter 1: Data-Driven Decision Frameworks

Effective product managers use data to inform their decisions rather than relying on intuition alone.
The key frameworks include:

1. RICE Scoring: Evaluate features by Reach, Impact, Confidence, and Effort.
   - Reach: How many users will this affect per quarter?
   - Impact: How much will this move the needle? (Massive=3, High=2, Medium=1, Low=0.5, Minimal=0.25)
   - Confidence: How sure are you about the estimates? (High=100%, Medium=80%, Low=50%)
   - Effort: How many person-months will this take?

2. Opportunity Solution Trees: Map desired outcomes to opportunities to solutions.
   Start with a measurable outcome, identify opportunities through user research,
   then brainstorm solutions for each opportunity.

3. Cost of Delay: Quantify what you lose by NOT doing something.
   Urgent + high value = do first. Not urgent + high value = schedule. Urgent + low value = delegate.

Chapter 2: Stakeholder Alignment

Aligning stakeholders requires understanding their motivations and constraints.
Key techniques:
- Pre-alignment: Meet individually before group decisions
- Shared metrics: Agree on success criteria upfront
- Decision logs: Document who decided what and why
- Disagree and commit: Allow dissent but require commitment once decided

Chapter 3: Risk Assessment

Every decision carries risk. Product managers should:
- Identify risks early using pre-mortem analysis
- Categorize risks by likelihood and impact
- Create mitigation plans for high-likelihood, high-impact risks
- Use reversibility as a decision accelerator (reversible decisions can be made faster)
'''

y = 750
for line in content.split('\n'):
    if y < 50:
        c.showPage()
        c.setFont('Helvetica', 12)
        y = 750
    c.drawString(72, y, line.strip())
    y -= 15

c.save()
print('Test PDF created at ./test_files/test_course.pdf')
"
```

If reportlab isn't installed, use a simple text file instead:
```bash
mkdir -p test_files
cat > test_files/test_course.txt << 'EOF'
Strategic Decision Making for Product Managers
... (same content as above)
EOF
```

### 3b. Seed the database (if not already done)
```bash
cd services/api
python seed.py
```

### 3c. Upload the file via API
```bash
# Upload the test file
curl -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -F "files=@test_files/test_course.pdf" \
  -v

# Save the file_id from the response
```

### 3d. Generate a course
```bash
# Use the file_id from step 3c
curl -X POST http://localhost:8000/api/admin/courses/generate \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["<FILE_ID_FROM_UPLOAD>"]}'

# Save the job_id from the response
```

### 3e. Poll until complete
```bash
# Poll the job status
curl http://localhost:8000/api/admin/ingestion/<JOB_ID> \
  -H "Authorization: Bearer dev:auth0|admin-james"

# Keep polling until status is "completed" or "failed"
# If "failed", read the error_message and fix it
```

### 3f. Verify the course was created
```bash
# List courses
curl http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james"

# The new course should appear with title, description, and ai_generated_metadata
```

### 3g. Verify RAG embeddings exist
```python
python -c "
import asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.content_embedding import ContentEmbedding

async def check():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery')
    session_factory = async_sessionmaker(engine, class_=AsyncSession)
    async with session_factory() as db:
        count = (await db.execute(select(func.count(ContentEmbedding.id)))).scalar()
        print(f'Content embeddings in DB: {count}')
    await engine.dispose()

asyncio.run(check())
"
```

### 3h. Publish and verify learner can see it
```bash
# Publish the course
curl -X POST http://localhost:8000/api/admin/courses/<COURSE_ID>/publish \
  -H "Authorization: Bearer dev:auth0|admin-james"

# Check as learner
curl http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-maria"

# The course should appear in the available list
```

## Step 4: Multi-Tenant Isolation Test

This is a SECURITY requirement. You must prove that one org cannot see another org's data.

### 4a. Create a second org with its own admin and learner

Write and run a script that creates:

```python
"""Create a second org for multi-tenant testing."""
import asyncio, uuid
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.organization import Organization, PlanTier
from app.models.user import User, UserRole

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery"

async def create_second_org():
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        org2_id = uuid.uuid4()
        org2 = Organization(
            id=org2_id, name="Beta Corp", slug="beta-corp", plan_tier=PlanTier.starter,
            settings={"branding": {"primary_color": "#FF6B35"}},
        )
        db.add(org2)

        admin2 = User(
            id=uuid.uuid4(), email="admin@beta.com", display_name="Sarah Kim",
            role=UserRole.org_admin, org_id=org2_id, auth0_sub="auth0|admin-sarah",
        )
        db.add(admin2)

        learner2 = User(
            id=uuid.uuid4(), email="tom@beta.com", display_name="Tom Park",
            role=UserRole.learner, org_id=org2_id, auth0_sub="auth0|learner-tom",
        )
        db.add(learner2)

        await db.commit()
        print(f"Second org created: Beta Corp ({org2_id})")
        print(f"  Admin: admin@beta.com (auth0|admin-sarah)")
        print(f"  Learner: tom@beta.com (auth0|learner-tom)")

    await engine.dispose()

asyncio.run(create_second_org())
```

### 4b. Upload content as Org 2 admin

```bash
# Upload as Beta Corp admin
curl -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer dev:auth0|admin-sarah" \
  -F "files=@test_files/test_course.pdf"

# Generate course as Beta Corp
curl -X POST http://localhost:8000/api/admin/courses/generate \
  -H "Authorization: Bearer dev:auth0|admin-sarah" \
  -H "Content-Type: application/json" \
  -d '{"file_ids": ["<BETA_FILE_ID>"]}'
```

### 4c. Verify ISOLATION — these must ALL pass

**Org 1 admin CANNOT see Org 2's data:**
```bash
# Acme admin lists courses — should NOT see Beta Corp's course
curl http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james"
# VERIFY: response contains only Acme courses, not Beta Corp's

# Acme admin lists users — should NOT see Beta Corp's users
curl http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer dev:auth0|admin-james"
# VERIFY: response contains only Acme users (James, Maria), not Sarah or Tom

# Acme admin lists files — should NOT see Beta Corp's uploads
curl http://localhost:8000/api/admin/courses \
  -H "Authorization: Bearer dev:auth0|admin-james"
# VERIFY: no Beta Corp data
```

**Org 2 learner CANNOT see Org 1's data:**
```bash
# Beta learner lists available courses — should NOT see Acme's courses
curl http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-tom"
# VERIFY: only Beta Corp courses (if published), not Acme's

# Beta learner cannot access Acme learner's mastery profile
curl http://localhost:8000/api/mastery/me/profile \
  -H "Authorization: Bearer dev:auth0|learner-tom"
# VERIFY: returns Tom's profile or 404, never Maria's
```

**Cross-org access MUST be denied:**
```bash
# Acme admin tries to get a Beta Corp course by ID — should 404
curl http://localhost:8000/api/courses/<BETA_COURSE_ID> \
  -H "Authorization: Bearer dev:auth0|admin-james"
# VERIFY: 404 Not Found (not the actual course data)

# Beta admin tries to poll Acme's ingestion job — should 404
curl http://localhost:8000/api/admin/ingestion/<ACME_JOB_ID> \
  -H "Authorization: Bearer dev:auth0|admin-sarah"
# VERIFY: 404 Not Found
```

**Org 2 admin CANNOT see Org 1 analytics:**
```bash
curl http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-sarah"
# VERIFY: shows Beta Corp stats only (1 learner, etc.), not Acme's
```

### 4d. If ANY isolation test fails

This is a **critical security bug**. Fix the query to include `org_id` filtering. Every single database query that returns tenant data MUST filter by `org_id`. Check every router — courses, programs, admin, mastery, conversations — and verify the org_id WHERE clause is present.

---

## Step 5: Fix Everything That Breaks

When any step above fails:
1. Read the error message
2. Fix the root cause
3. Re-run from the step that failed
4. Do NOT move on until it works

## Step 6: Report Results

When the full pipeline works end-to-end, report:
- Exact curl commands and responses for each step
- The generated course title and description
- Number of RAG embeddings created
- Any bugs you found and fixed along the way

## DO NOT:
- Say "this should work" — prove it works
- Skip error handling — surface every error clearly
- Mark done without running the actual pipeline
- Assume database tables exist — verify them
