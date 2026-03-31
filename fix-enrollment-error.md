# Fix Enrollment Error — Claude Code Prompt

> **THE RULE: Actually test the enrollment flow. Upload a file, generate a course, publish it, then try to enroll as a learner. If it fails, read the actual error from the API response and fix the root cause.**

---

## Bug 1: `[object Object]` alert on enrollment failure

**File**: `apps/web/src/app/courses/page.tsx`, line 58-59

The API client throws a plain object `{detail: "...", status: 400}`, not an Error. `String()` on a plain object gives `[object Object]`.

```typescript
// BROKEN (line 59):
alert(String(e));

// FIX:
const msg = (e && typeof e === 'object' && 'detail' in e) ? (e as any).detail : String(e);
alert(msg);
```

Better yet, replace the alert entirely with an inline error state:

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

// Show error inline instead of alert:
{error && (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        {error}
        <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
    </div>
)}
```

## Bug 2: API client throws plain objects instead of Error instances

**File**: `apps/web/src/lib/api-client.ts`, around line 52-63

```typescript
// CURRENT — throws plain object:
throw error;

// FIX — throw a proper Error with the detail message:
const err = new Error(error.detail);
(err as any).status = error.status;
throw err;
```

## Bug 3: Diagnose WHY enrollment is failing

**Run this to find the actual error:**

```bash
# 1. List available courses as learner
curl -s http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python -m json.tool

# 2. Pick a course ID and try to enroll
curl -s -X POST http://localhost:8000/api/enrollments \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"course_id": "<COURSE_ID>"}' -v

# The -v flag shows the HTTP status code and full response
# Look for: 400 (not published), 404 (not found / wrong org), 409 (already enrolled), 500 (server error)
```

**Common causes:**
- Course status is "draft" not "active" → admin needs to publish it first
- Course org_id doesn't match learner's org_id → tenant isolation blocking
- The learner is already enrolled → 409 conflict
- Database schema mismatch → 500 internal server error

**Fix the root cause, don't just fix the alert.**

## VERIFY

After fixing:
1. Go to the courses page as a learner
2. Click Enroll on an available course
3. **MUST**: Course moves from "Available" to "Your Courses" — no error dialog
4. Click "Start Session" on the enrolled course
5. **MUST**: Session page loads and Nexi responds
