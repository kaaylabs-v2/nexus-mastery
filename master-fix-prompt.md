# Nexus² Master Fix — Every Bug, Every Issue, Verified

> **CONTEXT**: Full code audit found 38 backend bugs and 20+ frontend issues. This prompt fixes ALL of them. Every fix must be verified by running the app and proving it works. Write Playwright tests for every frontend fix.

> **THE RULE**: Fix → Run → Verify → Screenshot. No fix is done until you've seen it working in the browser or in curl output. The words "this should work" are BANNED.

---

## PART A: Backend Fixes (Do These First)

### A1. Add missing db.commit() calls — 8 locations

These are all write operations that update the database but never commit. Changes are silently lost.

**File**: `/services/api/app/routers/admin.py`
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

**File**: `/services/api/app/routers/enrollments.py`
```python
# unenroll — add after db.delete
await db.delete(enrollment)
await db.commit()  # ← ADD THIS
```

**File**: `/services/api/app/routers/conversations.py`
```python
# add_message endpoint — add commit after flush
conversation.messages = messages
await db.flush()
await db.commit()  # ← ADD THIS
await db.refresh(conversation)
```

**File**: `/services/api/app/services/file_storage.py`
```python
# delete_file — add after db.delete
await db.delete(cf)
await db.commit()  # ← ADD THIS
```

**File**: `/services/api/app/services/mastery_service.py`
```python
# update_mastery_profile — add commit
await db.flush()
await db.commit()  # ← ADD THIS
return profile
```

Also add `from sqlalchemy.orm.attributes import flag_modified` and use it before every JSONB commit in conversations.py:
```python
conversation.messages = messages
flag_modified(conversation, "messages")
await db.commit()
```

**VERIFY**:
```bash
# Publish a course and verify it persists
curl -X POST http://localhost:8000/api/admin/courses/<ID>/publish -H "Authorization: Bearer dev:auth0|admin-james"
# Then check it's still published:
curl http://localhost:8000/api/courses/<ID> -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
# status MUST be "active", not "draft"
```

---

### A2. Fix conversation_summary type inconsistency

**File**: `/services/api/app/models/mastery_profile.py`
Change the default from `dict` to `list`:
```python
conversation_summary: Mapped[list | None] = mapped_column(JSONB, default=list)
```

**File**: `/services/api/app/routers/conversations.py` (complete_conversation)
Remove the dict-to-list conversion:
```python
# Replace:
summaries = profile.conversation_summary or {}
if not isinstance(summaries, list):
    summaries = []

# With:
summaries = profile.conversation_summary or []
```

---

### A3. Fix text chunking infinite loop

**File**: `/services/api/app/services/rag_pipeline.py`
```python
def _chunk_text(text_content: str) -> list[str]:
    if not text_content.strip():
        return []
    chunks = []
    start = 0
    while start < len(text_content):
        end = min(start + CHUNK_SIZE, len(text_content))
        chunk = text_content[start:end]
        if chunk.strip():  # Don't add empty chunks
            chunks.append(chunk)
        if end >= len(text_content):
            break  # We've reached the end
        start = end - CHUNK_OVERLAP
        if start >= end:  # Prevent infinite loop
            break
    return chunks
```

---

### A4. Fix _build_messages corrupting history

**File**: `/services/api/app/services/nexi_engine.py`

In `_build_messages`, filter out internal messages instead of converting them:
```python
messages = []
for msg in conversation_history:
    role = msg.get("role", "user")
    if role not in ("user", "assistant"):
        continue  # Skip internal/metadata messages
    content = msg.get("content", "")
    if not content.strip():
        continue  # Skip empty messages
    messages.append({"role": role, "content": content})
```

---

### A5. Fix course creation not using authenticated org_id

**File**: `/services/api/app/routers/courses.py`
```python
@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_in: CourseCreate,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),  # ← ADD THIS
    db: AsyncSession = Depends(get_db),
):
    if user.role.value not in ("org_admin", "facilitator"):
        raise HTTPException(status_code=403, detail="Only admins and facilitators can create courses")
    data = course_in.model_dump(exclude={"org_id"})  # ← Exclude client org_id
    course = Course(org_id=org_id, **data)  # ← Use authenticated org_id
    db.add(course)
    await db.flush()
    await db.commit()
    await db.refresh(course)
    return course
```

---

### A6. Fix analytics showing wrong enrollment counts

**File**: `/services/api/app/routers/admin.py` — analytics_overview

Replace the hardcoded `total_learners` with actual per-program enrollment counts:
```python
top_programs = []
for p in programs[:5]:
    # Count actual enrollments for courses linked to this program
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

### A7. Add override instruction to Nexi system prompt

**File**: `/services/api/app/services/nexi_engine.py`

Add this after the `CURRENT SESSION MODE` line in `_build_messages`:
```python
system_parts.append("""

IMPORTANT RULES:
1. If the learner explicitly asks you to teach, explain, or give an example, ALWAYS respond by teaching — regardless of what mode you're in.
2. NEVER give the same response twice. Every response must be unique and contextual.
3. Format your teaching clearly: use short paragraphs (2-3 sentences each), not one massive wall of text. Break concepts into digestible pieces.
4. Do NOT output raw markdown syntax (no # or ## or ** in your responses). Write in clean, natural prose. Use plain language, not formatting marks.""")
```

---

## PART B: Frontend Fixes

### B1. Replace hardcoded session-1 links with dynamic session creation

**File**: `apps/web/src/app/page.tsx`

Replace ALL `href="/session/session-1"` with a function that creates a real conversation:

```typescript
const [startingSession, setStartingSession] = useState(false);
const router = useRouter(); // import from next/navigation

const handleStartSession = async (courseId?: string) => {
  if (USE_MOCK) {
    router.push("/session/session-1");
    return;
  }
  setStartingSession(true);
  try {
    // Use the first enrolled course if no courseId provided
    const targetCourse = courseId || enrolledCourses[0]?.id;
    if (!targetCourse) {
      // If no courses, redirect to courses page
      router.push("/courses");
      return;
    }
    const conv = await apiClient.createConversation(targetCourse);
    router.push(`/session/${conv.id}`);
  } catch (e) {
    console.error("Failed to start session:", e);
    // Fallback to courses page
    router.push("/courses");
  } finally {
    setStartingSession(false);
  }
};
```

Replace the `<Link href="/session/session-1">` elements:
```tsx
// Line 95 — "Enter Arena" button:
<button onClick={() => handleStartSession()} disabled={startingSession}>
  {startingSession ? "Starting..." : "Enter Arena"}
</button>

// Line 219 — Available Sessions cards:
<button onClick={() => handleStartSession(enrolledCourses[0]?.id)}>
  Start
</button>
```

---

### B2. Render markdown properly in chat messages

**File**: `apps/web/src/app/session/[id]/page.tsx`

Install a markdown renderer:
```bash
cd apps/web && npm install react-markdown
```

Then wrap Nexi's messages in a markdown renderer:
```tsx
import ReactMarkdown from "react-markdown";

// Where Nexi messages are rendered, replace:
<p>{msg.content}</p>

// With:
<div className="prose prose-sm max-w-none text-foreground">
  <ReactMarkdown>{msg.content}</ReactMarkdown>
</div>
```

Also for the streaming content:
```tsx
<div className="prose prose-sm max-w-none text-foreground">
  <ReactMarkdown>{streamingContent}</ReactMarkdown>
</div>
```

Add Tailwind typography plugin if not installed:
```bash
npm install @tailwindcss/typography
```

Add to tailwind.config:
```javascript
plugins: [require("@tailwindcss/typography")]
```

---

### B3. Fix [object Object] alert on enrollment

**File**: `apps/web/src/app/courses/page.tsx`

Replace the alert with an inline error state:
```typescript
const [error, setError] = useState<string | null>(null);

const handleEnroll = async (courseId: string) => {
  setEnrolling(courseId);
  setError(null);
  try {
    await apiClient.enrollInCourse(courseId);
    const course = available.find((c) => c.id === courseId);
    if (course) {
      setAvailable((prev) => prev.filter((c) => c.id !== courseId));
      setEnrolled((prev) => [...prev, course]);
    }
  } catch (e: any) {
    setError(e?.detail || e?.message || "Enrollment failed. Please try again.");
  }
  setEnrolling(null);
};
```

Also fix the API client to throw proper Errors:
**File**: `apps/web/src/lib/api-client.ts`
```typescript
// Replace: throw error;
// With:
const err = new Error(error.detail);
(err as any).status = error.status;
throw err;
```

---

### B4. Fix status badge labels

**File**: `apps/web/src/app/page.tsx`

Replace the broken ternary:
```tsx
// Replace:
{skill.status === "critical" ? "Critical" : "Attention"}

// With:
{skill.status === "critical" ? "Critical" :
 skill.status === "proficient" ? "Proficient" :
 skill.status === "advanced" ? "Advanced" : "Attention"}
```

---

### B5. Fix or remove broken sidebar links

**File**: `apps/web/src/components/layout/sidebar.tsx`

Remove or disable pages that don't exist yet:
```typescript
const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  // Remove these until implemented:
  // { href: "/analytics", label: "Analytics", icon: BarChart3 },
  // { href: "/journal", label: "Journal", icon: BookOpen },
  // { href: "/profile", label: "Profile", icon: User },
];
```

---

### B6. Fix admin programs "New Program" button

**File**: `apps/admin/src/app/programs/page.tsx`

Add an onClick handler that opens a create dialog or navigates to a create form.

---

### B7. Add error states to all pages

Every page that fetches data should have 3 states: loading, data, error. Replace all `.catch(console.error)` and `.catch(() => {})` with actual error state management:

```typescript
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  fetchData()
    .then(setData)
    .catch((e) => setError(e?.detail || e?.message || "Failed to load"))
    .finally(() => setLoading(false));
}, []);

// In JSX:
{error && (
  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
    {error}
    <button onClick={() => { setError(null); setLoading(true); fetchData()... }} className="ml-2 underline">
      Retry
    </button>
  </div>
)}
```

Apply this pattern to: admin dashboard, programs list, program detail, users, analytics, settings, learner dashboard, courses page.

---

## PART C: Playwright Tests

After all fixes are applied, write and run these Playwright tests. **Every test must pass before this prompt is considered done.**

### C1. Basic Navigation Test
```typescript
// apps/admin/e2e/navigation.spec.ts
// Click every sidebar link, verify no page crashes or shows blank
```

### C2. Programs Test
```typescript
// apps/admin/e2e/programs.spec.ts
// Navigate to programs → verify count > 0 → click a program → verify detail loads (not "not found")
```

### C3. Session Test
```typescript
// apps/web/e2e/session.spec.ts
// Start a session → verify Nexi responds → verify response is formatted (no raw markdown) → verify response is unique
```

### C4. Enrollment Test
```typescript
// apps/web/e2e/enrollment.spec.ts
// Go to courses → click Enroll → verify no [object Object] → verify course moves to enrolled
```

### C5. Cross-App Test (THE MOST IMPORTANT ONE)
```typescript
// apps/admin/e2e/cross-app.spec.ts
// Admin uploads Pomodoro file → generates course → publishes →
// Learner enrolls → starts session → types "teach me about Pomodoro" →
// Verify Nexi's response contains keywords from the uploaded file
// Use the full cross-app test from e2e-browser-testing.md
```

Run ALL tests in headed mode:
```bash
cd apps/admin && npx playwright test --headed
cd ../web && npx playwright test --headed
```

---

## VERIFY CHECKLIST

Before marking this done, every item must be checked:

- [ ] Publish a course → restart server → course is still published (commit works)
- [ ] Enroll → unenroll → re-enroll (all commits work)
- [ ] Change user role → verify it persists
- [ ] Programs page shows programs (not "0 programs")
- [ ] Program detail loads (not "Program not found")
- [ ] Session page: click "Enter Arena" → creates REAL conversation (not session-1)
- [ ] Nexi's response is formatted nicely (no raw # or ** markdown syntax)
- [ ] Nexi gives unique responses (not the same canned text)
- [ ] Enrollment on courses page works (no [object Object])
- [ ] Status badges show correct labels (Proficient, Advanced, not just Critical/Attention)
- [ ] Sidebar only shows pages that exist
- [ ] Analytics shows real per-program enrollment counts
- [ ] All Playwright tests pass in headed mode
- [ ] Cross-app test proves uploaded content appears in Nexi's teaching

## DO NOT:
- Fix one thing and move to the next without verifying it works
- Write Playwright tests that silently skip steps with `.catch(() => null)`
- Say "this should work" — run it and prove it
- Leave any `.catch(console.error)` or `.catch(() => {})` in the codebase
