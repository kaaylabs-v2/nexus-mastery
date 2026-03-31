# Add "Restart Course" Feature — Claude Code Prompt

> **THE RULE: Test this by enrolling in a course, completing a session, then restarting the course and verifying everything resets cleanly. Show proof.**

---

## What It Should Do

When a learner is viewing a course they've been working through, they should be able to restart the entire course from scratch — reset their enrollment status, archive old conversations, and start over as if they're taking the course for the first time. This is useful when:
- They want to go through the material again after some time has passed
- They feel they didn't absorb it well the first time
- They want a fresh assessment of their mastery on this topic

---

## Backend

### Restart Course endpoint

**File**: `/services/api/app/routers/enrollments.py`

```python
@router.post("/{enrollment_id}/restart")
async def restart_course(
    enrollment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restart a course — archives old conversations, resets enrollment status."""

    # Find the enrollment
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.id == enrollment_id,
            Enrollment.user_id == user.id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    # Archive all existing conversations for this course
    # (mark them as ended, don't delete — preserve history)
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.user_id == user.id,
            Conversation.course_id == enrollment.course_id,
            Conversation.ended_at.is_(None),  # only open ones
        )
    )
    open_conversations = conv_result.scalars().all()
    for conv in open_conversations:
        conv.ended_at = datetime.now(timezone.utc)

    # Reset enrollment status back to not_started
    enrollment.mastery_status = MasteryStatus.not_started
    enrollment.mastery_achieved_at = None

    # Reset course-specific progress in mastery profile (if tracked per-course)
    profile_result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile and profile.course_progress:
        course_id_str = str(enrollment.course_id)
        progress = dict(profile.course_progress)
        if course_id_str in progress:
            progress[course_id_str] = {"level": 0, "percentage": 0, "restarted": True}
            profile.course_progress = progress

    await db.commit()

    return {
        "status": "restarted",
        "enrollment_id": str(enrollment.id),
        "course_id": str(enrollment.course_id),
        "conversations_archived": len(open_conversations),
        "mastery_status": "not_started",
    }
```

Add the necessary imports at the top of enrollments.py:
```python
from datetime import datetime, timezone
from app.models.conversation import Conversation
from app.models.mastery_profile import MasteryProfile
```

### Add to API client

**File**: `apps/web/src/lib/api-client.ts`

```typescript
async restartCourse(enrollmentId: string) {
    return this.request<{
        status: string;
        enrollment_id: string;
        course_id: string;
        conversations_archived: number;
        mastery_status: string;
    }>(`/api/enrollments/${enrollmentId}/restart`, { method: "POST" });
}
```

---

## Frontend

The restart option should appear wherever the learner sees their enrolled courses.

### On the Dashboard — course cards

**File**: `apps/web/src/app/page.tsx`

In the "Your Courses" section, each enrolled course card should have a small menu (three dots or kebab icon) with a "Restart Course" option.

```tsx
import { MoreVertical, RotateCcw } from "lucide-react";

// For each enrolled course card:
<div className="relative group">
    {/* Existing course card content */}
    <Link href={`/session/new?course=${course.id}`}>
        {/* ... card body ... */}
    </Link>

    {/* Options menu */}
    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
            onClick={(e) => {
                e.preventDefault();
                setRestartCourseId(course.id);
                setRestartEnrollmentId(course.enrollment_id); // need to pass this from API
                setShowRestartConfirm(true);
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Course options"
        >
            <MoreVertical className="h-4 w-4" />
        </button>
    </div>
</div>
```

### Confirmation dialog

```tsx
const [showRestartConfirm, setShowRestartConfirm] = useState(false);
const [restartEnrollmentId, setRestartEnrollmentId] = useState<string | null>(null);
const [restarting, setRestarting] = useState(false);

const handleRestartCourse = async () => {
    if (!restartEnrollmentId) return;
    setRestarting(true);
    try {
        await apiClient.restartCourse(restartEnrollmentId);
        // Refresh the course list
        const enrolled = await apiClient.listMyCourses();
        setEnrolledCourses(enrolled);
        setShowRestartConfirm(false);
    } catch (e) {
        console.error("Restart failed:", e);
    } finally {
        setRestarting(false);
    }
};

// Confirmation modal:
{showRestartConfirm && (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-card rounded-xl border border-border p-6 max-w-sm mx-4 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Restart this course?</h3>
            </div>
            <p className="text-xs text-muted-foreground">
                This will reset your progress and start the course from the beginning.
                Your previous session history will be saved but won't count toward your current progress.
            </p>
            <div className="flex items-center gap-2 mt-4">
                <button
                    onClick={() => setShowRestartConfirm(false)}
                    className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                    Cancel
                </button>
                <button
                    onClick={handleRestartCourse}
                    disabled={restarting}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {restarting ? "Restarting..." : "Restart Course"}
                </button>
            </div>
        </div>
    </div>
)}
```

### Update the enrolled courses API response

The `GET /api/courses/me/enrolled` endpoint needs to return the `enrollment_id` along with course data so the frontend knows which enrollment to restart.

**File**: `/services/api/app/routers/courses.py`

Update the enrolled courses endpoint to include enrollment info:

```python
@router.get("/me/enrolled")
async def list_my_courses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Course, Enrollment)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user.id, Course.status == CourseStatus.active)
    )
    rows = result.all()
    return [
        {
            "id": str(course.id),
            "title": course.title,
            "description": course.description,
            "status": course.status.value if hasattr(course.status, 'value') else course.status,
            "enrollment_id": str(enrollment.id),
            "mastery_status": enrollment.mastery_status.value if hasattr(enrollment.mastery_status, 'value') else enrollment.mastery_status,
        }
        for course, enrollment in rows
    ]
```

Update the frontend type to include the new fields:

**File**: `apps/web/src/lib/api-client.ts`

```typescript
async listMyCourses() {
    return this.request<Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        enrollment_id: string;
        mastery_status: string;
    }>>("/api/courses/me/enrolled");
}
```

---

## VERIFY

1. Enroll in a course, start a session, send a few messages
2. Go back to the dashboard
3. Hover over the course card — the options menu should appear
4. Click "Restart Course"
5. Confirm in the dialog
6. **MUST**: Course card shows `mastery_status: "not_started"` again
7. Start a new session on that course — Nexi should start fresh from the Learn phase
8. Check the DB — old conversations should have `ended_at` set, enrollment should be `not_started`
9. The old conversations should still be visible in history (not deleted)
