# Batch 0b: Fix Course Publish Flow — Courses Invisible to Learners

> **PRIORITY**: BLOCKING — Uploaded courses never appear in the learner app because they're stuck in `draft` status and there's no way to publish them from the admin UI.
> **ESTIMATED TIME**: 30 minutes
> **DEPENDENCIES**: Batch 0 (admin app loads)

---

## Root Cause

When a course is generated via Upload & Generate, it's created with `status = CourseStatus.draft` (admin.py line 127). The learner app's `/me/enrolled` and `/me/available` endpoints both filter by `Course.status == CourseStatus.active`. Draft courses are invisible. The admin API has a `POST /api/admin/courses/{id}/publish` endpoint, but there is NO publish button anywhere in the admin UI.

---

## Fix 1: Auto-publish courses after successful ingestion

The simplest fix: when ingestion completes successfully, automatically publish the course.

**File**: `services/api/app/routers/admin.py`

Find the `_run_ingestion()` background task. At the end, after the ingestion job is marked `completed`, also publish the course:

```python
# Find the section where job.status is set to "completed" — around line 200-210
# After that line, add:
if course:
    course.status = CourseStatus.active
    course.published_at = datetime.now(timezone.utc)
await db.commit()
```

---

## Fix 2: Add a Publish/Unpublish button to the admin courses list

The admin needs to be able to see courses and publish/unpublish them. There are two places this could go:

### Option A: Add to the existing Upload & Generate page (after generation)

**File**: `apps/admin/src/app/upload/page.tsx`

After ingestion completes successfully, show the generated course with a "Publish" button:

```tsx
{ingestionComplete && generatedCourse && (
  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
    <h3 className="font-semibold text-green-800">Course Generated!</h3>
    <p className="text-sm text-green-700 mt-1">{generatedCourse.title}</p>
    <div className="flex gap-2 mt-3">
      <button
        onClick={async () => {
          await adminApi.publishCourse(generatedCourse.id);
          setPublished(true);
        }}
        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
      >
        Publish to Learners
      </button>
    </div>
    {published && (
      <p className="text-xs text-green-600 mt-2">✓ Published — learners can now see this course</p>
    )}
  </div>
)}
```

### Option B: Add a Courses management section to the admin Dashboard or as its own page

**File**: Create `apps/admin/src/app/courses/page.tsx` OR add to the Dashboard

```tsx
"use client";
import { useEffect, useState } from "react";
import { adminApi, Course } from "@/lib/api-client";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listCourses()
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handlePublish = async (id: string) => {
    await adminApi.publishCourse(id);
    setCourses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "active", published_at: new Date().toISOString() } : c))
    );
  };

  if (loading) return <div className="p-8">Loading courses...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-xl font-semibold mb-6">Courses</h1>
      <div className="space-y-3">
        {courses.map((course) => (
          <div key={course.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-medium">{course.title}</h3>
              <p className="text-sm text-gray-500">{course.description}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                course.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}>
                {course.status === "active" ? "Published" : "Draft"}
              </span>
            </div>
            {course.status !== "active" && (
              <button
                onClick={() => handlePublish(course.id)}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Publish
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

If you create a new page, add "Courses" to the admin sidebar:

**File**: `apps/admin/src/components/admin-sidebar.tsx`
Add a link to `/courses` in the nav items.

---

## Fix 3: Publish the currently stuck draft course RIGHT NOW

Before even building the UI, publish whatever courses are in draft so the learner can see them immediately:

```bash
# List all courses and their statuses:
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -m json.tool

# For each course that has status "draft", publish it:
curl -X POST http://localhost:8000/api/admin/courses/<COURSE_ID>/publish \
  -H "Authorization: Bearer dev:auth0|admin-james"

# Repeat for every draft course you want learners to see.
```

---

## Verification (MANDATORY)

```bash
# 1. Check that the course is now active:
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -c "
import json, sys
courses = json.load(sys.stdin)
for c in courses:
    print(f'{c[\"title\"]}: {c[\"status\"]}')
"
# ✓ Your uploaded course must show "active"

# 2. Check the learner can see it:
curl -s http://localhost:8000/api/courses/me/available \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -m json.tool
# ✓ Must include the newly published course

# 3. Open localhost:3000/courses in browser
# ✓ Course must appear in either "Your Courses" or "Available to Enroll"
```

## Done criteria
- Newly generated courses auto-publish after successful ingestion (or have a clear Publish button)
- All existing draft courses are published
- Learner app shows the uploaded course
- Admin has a way to publish/unpublish courses from the UI
