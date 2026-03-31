# Batch 4: Backend Quality — Fix Before You Scale

> **PRIORITY**: MEDIUM — Won't bite you with 5 users but will with 500.
> **ESTIMATED TIME**: 2-3 hours
> **DEPENDENCIES**: Batch 1 and 2 should be done first.
> **RULE**: Every fix must include a test or verification step.

---

## Fix 1: Fix RAG vector query

**File**: `services/api/app/services/rag_pipeline.py`

The `retrieve_relevant()` function builds the embedding as a string concatenation and passes it to PostgreSQL. Use pgvector's proper casting instead.

```python
# Find the embedding string construction — something like:
embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
result = await db.execute(
    text("SELECT ... ORDER BY embedding <=> :embedding"),
    {"embedding": embedding_str}
)

# Replace with proper pgvector casting:
result = await db.execute(
    text("SELECT id, chunk_text, chunk_metadata, embedding <=> :embedding::vector AS distance "
         "FROM content_embeddings "
         "WHERE course_id = :course_id "
         "ORDER BY embedding <=> :embedding::vector "
         "LIMIT :limit"),
    {
        "embedding": str(query_embedding),  # pgvector handles the conversion with ::vector cast
        "course_id": str(course_id),
        "limit": limit,
    }
)
```

**VERIFY**: Upload a document through the admin, generate a course, then start a session and ask about the content. Nexi should reference the uploaded material. Check server logs for SQL errors.

---

## Fix 2: Fix text chunking infinite loop

**File**: `services/api/app/services/rag_pipeline.py`

The `_chunk_text()` function can loop forever if the remaining text is smaller than `CHUNK_OVERLAP`.

```python
# Replace the entire _chunk_text function with:
def _chunk_text(text_content: str) -> list[str]:
    if not text_content or not text_content.strip():
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
            break  # Reached end of text
        next_start = end - CHUNK_OVERLAP
        if next_start <= start:
            break  # Would go backwards — prevent infinite loop
        start = next_start
    return chunks
```

**VERIFY**:
```python
# Test with edge cases:
assert len(_chunk_text("")) == 0
assert len(_chunk_text("   ")) == 0
assert len(_chunk_text("short")) == 1
assert len(_chunk_text("x" * 999)) == 1  # Under chunk size
assert len(_chunk_text("x" * 1001)) == 2  # Just over chunk size
assert len(_chunk_text("x" * 50)) == 1    # Under overlap size

# Test it doesn't hang:
import signal
signal.alarm(5)  # Kill after 5 seconds
result = _chunk_text("x" * 100000)  # Large text
signal.alarm(0)
assert len(result) > 0
```

---

## Fix 3: Fix conversation_summary type mismatch

**File**: `services/api/app/models/mastery_profile.py`

The model declares `conversation_summary` with `default=dict` but the code treats it as a list.

```python
# Ensure the field is:
conversation_summary: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
```

**File**: `services/api/app/routers/conversations.py` — `complete_conversation`

```python
# Find:
summaries = profile.conversation_summary or {}
if not isinstance(summaries, list):
    summaries = []

# Replace with:
summaries = profile.conversation_summary if isinstance(profile.conversation_summary, list) else []
```

**VERIFY**: Complete a conversation, then check the mastery profile in the DB:
```bash
curl http://localhost:8000/api/mastery/profile -H "Authorization: Bearer <TOKEN>"
# ✓ conversation_summary must be a list [], not a dict {}
```

---

## Fix 4: Fix course creation using client-provided org_id

**File**: `services/api/app/routers/courses.py`

The `create_course` endpoint trusts the `org_id` from the request body instead of using the authenticated user's org.

```python
@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_in: CourseCreate,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),  # ← Use authenticated org
    db: AsyncSession = Depends(get_db),
):
    if user.role.value not in ("org_admin", "facilitator"):
        raise HTTPException(status_code=403, detail="Only admins and facilitators can create courses")
    data = course_in.model_dump(exclude={"org_id"})  # ← Exclude client-provided org_id
    course = Course(org_id=org_id, **data)  # ← Use authenticated org_id
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course
```

**VERIFY**:
```bash
# Try creating a course with a different org_id in the body:
curl -X POST http://localhost:8000/api/courses \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "org_id": "00000000-0000-0000-0000-000000000000", "description": "test"}'
# ✓ The created course's org_id should match YOUR org, not the fake one in the body
```

---

## Fix 5: Fix N+1 query in user listing

**File**: `services/api/app/routers/admin.py` — `list_users` (around line 306)

Currently fetches all users, then for EACH user runs a separate COUNT query for enrollments.

```python
from sqlalchemy import func

# Replace the loop of individual queries with a single joined query:
stmt = (
    select(
        User,
        func.count(Enrollment.id).label("enrollment_count")
    )
    .outerjoin(Enrollment, Enrollment.user_id == User.id)
    .where(User.org_id == org_id)
    .group_by(User.id)
    .order_by(User.created_at.desc())
)
results = (await db.execute(stmt)).all()

users = []
for user, enrollment_count in results:
    user_dict = {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "enrollment_count": enrollment_count,
        "created_at": user.created_at.isoformat(),
    }
    users.append(user_dict)
```

**VERIFY**: Add logging to count queries, then call the endpoint:
```bash
# Before fix: logs should show N+1 SELECT statements
# After fix: should show exactly 1 SELECT statement
curl http://localhost:8000/api/admin/users -H "Authorization: Bearer <TOKEN>"
```

---

## Fix 6: Fix _build_messages corrupting conversation history

**File**: `services/api/app/services/nexi_engine.py`

The `_build_messages` function doesn't properly filter out internal/metadata messages, which corrupts the message array sent to Claude.

```python
# Find _build_messages and replace the message loop with:
messages = []
for msg in conversation_history:
    role = msg.get("role", "user")
    if role not in ("user", "assistant"):
        continue  # Skip system/metadata/internal messages
    content = msg.get("content", "")
    if not content or not content.strip():
        continue  # Skip empty messages
    messages.append({"role": role, "content": content})

# Also ensure alternating user/assistant pattern (Claude API requirement):
cleaned = []
last_role = None
for msg in messages:
    if msg["role"] == last_role:
        # Merge consecutive same-role messages
        cleaned[-1]["content"] += "\n\n" + msg["content"]
    else:
        cleaned.append(msg)
        last_role = msg["role"]
messages = cleaned
```

**VERIFY**: Start a session, send 5+ messages back and forth. Check server logs for Anthropic API errors about message ordering. There should be none.

---

## Fix 7: Add Nexi system prompt improvements

**File**: `services/api/app/services/nexi_engine.py`

Add teaching quality instructions to the system prompt:

```python
# Find where the system prompt is built (after CURRENT SESSION MODE) and append:
system_parts.append("""

IMPORTANT TEACHING RULES:
1. If the learner asks you to teach, explain, or give an example — ALWAYS respond by teaching.
2. NEVER repeat the same response. Every response must be unique and contextual.
3. Break complex topics into 3-5 digestible points. Use short paragraphs (2-3 sentences each).
4. When course material is available, reference it specifically — don't give generic responses.
5. Ask one follow-up question at the end to check understanding.
6. Match your depth to the learner's level — don't over-explain basics or rush past confusion.""")
```

**VERIFY**: Start a session, ask Nexi the same question twice. The second response must be different from the first.

---

## Fix 8: Add Anthropic API error handling

**File**: `services/api/app/services/nexi_engine.py`

Currently if the Anthropic API times out or rate-limits, the user gets an unhelpful 500 error.

```python
import logging
from anthropic import APITimeoutError, RateLimitError, APIError

logger = logging.getLogger(__name__)

try:
    response = await client.messages.create(...)
except APITimeoutError:
    logger.error("Anthropic API timeout")
    raise HTTPException(504, "Nexi is taking too long to respond. Please try again.")
except RateLimitError:
    logger.warning("Anthropic API rate limit hit")
    raise HTTPException(429, "Nexi is handling a lot of conversations right now. Please wait a moment.")
except APIError as e:
    logger.error(f"Anthropic API error: {e}")
    raise HTTPException(502, "Nexi is temporarily unavailable. Please try again in a moment.")
```

---

## Fix 9: Fix ingestion error handling — stop swallowing errors silently

**File**: `services/api/app/routers/admin.py` — `_run_ingestion`

Failed chunk embeddings are silently skipped with `except Exception: continue`. Users have no visibility into what went wrong.

```python
import logging
logger = logging.getLogger(__name__)

# Replace: except Exception: continue
# With:
failed_chunks = 0
total_chunks = len(chunks)

for i, chunk in enumerate(chunks):
    try:
        embedding = await get_embedding(chunk)
        db.add(ContentEmbedding(chunk_text=chunk, embedding=embedding, ...))
    except Exception as e:
        logger.error(f"Failed to embed chunk {i+1}/{total_chunks} for file {file.id}: {e}")
        failed_chunks += 1
        continue

# After the loop:
if failed_chunks > 0:
    logger.warning(f"Ingestion completed with {failed_chunks}/{total_chunks} failed chunks")
    job.status = "completed_with_errors"
    job.error_message = f"{failed_chunks} of {total_chunks} content chunks failed to process"
else:
    job.status = "completed"
await db.commit()
```

**VERIFY**: Check server logs during file ingestion. Should see per-chunk status, not silence.

---

## Fix 10: Fix mutable defaults in SQLAlchemy models

Replace `default=dict` and `default=list` with lambda factories across all models:

**Files to fix**:
- `services/api/app/models/mastery_profile.py` — 6 fields
- `services/api/app/models/organization.py` — 1 field
- `services/api/app/models/conversation.py` — 1 field
- `services/api/app/models/content_embedding.py` — 1 field
- `services/api/app/models/course.py` — 1 field

```python
# Replace all instances of:
field: Mapped[dict | None] = mapped_column(JSONB, default=dict)
field: Mapped[list | None] = mapped_column(JSONB, default=list)

# With:
field: Mapped[dict | None] = mapped_column(JSONB, default=lambda: {})
field: Mapped[list | None] = mapped_column(JSONB, default=lambda: [])
```

**VERIFY**: Create two separate mastery profiles. Mutate one's `thinking_patterns`. The other's should remain empty `{}`.

---

## Done criteria
- RAG retrieval works end-to-end (upload → embed → query → get relevant content)
- Chunking never hangs, even on edge-case text sizes
- conversation_summary is always a list
- Course creation uses authenticated org_id, not client-provided
- User listing runs 1 SQL query, not N+1
- Nexi sends clean message history to Claude (no API errors)
- Nexi gives unique, high-quality teaching responses
- Anthropic API errors return helpful messages to users
- Ingestion failures are logged and reported
- No mutable default arguments in any model
