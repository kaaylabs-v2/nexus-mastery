# Fix: Analytics Page Revamp + Session Visuals Not Rendering

## Problem 1: Analytics Page is Hardcoded and Useless

**Current state:** `apps/web/src/app/analytics/page.tsx`
- "Growth Over Time" chart is hardcoded fake data (Jan-Jun, levels 2.2-3.1) — not pulled from any API
- Shows only ONE category's capabilities (from `activeCategory` in LearnerContext)
- No way to select which course to see analytics for
- No session history, no completion rates, no real growth tracking
- The capability breakdown shows 0% for everything because the API returns fresh capability data with no progress yet

**What it needs:**

### A. Course Selector Dropdown
- Add a dropdown at the top that lists all enrolled courses (`GET /api/courses/me/enrolled`)
- Default to "Overall" which aggregates across all courses
- When a course is selected, show analytics specific to that course

### B. Real Data from API — New Endpoints Needed
Create `GET /api/mastery/analytics/me` that returns:
```json
{
  "overall": {
    "total_sessions": 12,
    "total_time_minutes": 340,
    "courses_enrolled": 3,
    "courses_completed": 1,
    "avg_mastery_level": 2.8,
    "streak_days": 4
  },
  "growth": [
    { "date": "2026-03-20", "level": 2.2 },
    { "date": "2026-03-22", "level": 2.5 },
    { "date": "2026-03-25", "level": 2.8 }
  ],
  "by_course": [
    {
      "course_id": "uuid",
      "course_title": "Strategic Decision Making",
      "sessions_completed": 5,
      "topics_covered": 3,
      "total_topics": 9,
      "current_mode": "challenge",
      "last_session": "2026-03-25T10:00:00Z"
    }
  ],
  "capability_progress": [
    {
      "domain": "Analytical Thinking",
      "capabilities": [
        { "name": "Data-Driven Judgment", "initial": 0, "current": 1.8, "target": 3.5 }
      ]
    }
  ]
}
```

Backend implementation: query the `conversations` table for the user, aggregate session counts, extract mode progression from conversation metadata, compute growth from conversation timestamps and mastery assessments.

### C. Frontend Analytics Components
Replace the hardcoded page with:
1. **Summary cards** at top: Total Sessions, Time Spent, Courses In Progress, Current Streak
2. **Course selector dropdown** — "Overall" + each enrolled course
3. **Growth Over Time** chart — pull from real `growth` data (plot mastery level over session dates)
4. **Course Progress Grid** — for each course: progress bar, topics covered/total, last session date
5. **Capability Radar** — keep the existing radar but make it reactive to the selected course
6. **Capability Breakdown** — keep existing but show initial vs current to visualize actual growth

### D. Files to Edit
- `apps/web/src/app/analytics/page.tsx` — full rewrite
- `apps/web/src/lib/api-client.ts` — add `getMasteryAnalytics()` method
- `services/api/app/routers/mastery.py` — add the analytics endpoint
- `services/api/app/schemas/mastery.py` — add response schema

---

## Problem 2: Course Visuals ("2 visuals") Not Rendering in Sessions

**Current state:** The course outline has visuals (mermaid diagrams, charts, tables) stored in `course.course_outline` JSONB. The outline sidebar correctly shows "2 visuals" per topic. But during sessions, those visuals never appear in the chat.

**Root cause:** There's a race condition + missing trigger.

### A. Race Condition at Session Start
In `services/api/app/routers/conversations.py`, when the backend receives a `session_start` message, it:
1. Sends `outline_update` with the full outline
2. Sends `topic_visual` for the first topic's visuals
3. Then generates and streams the Nexi greeting

The visuals are sent BEFORE the greeting, but the frontend `useArenaSocket.ts` hook handles them correctly (they get added as messages). **However**, the conversation is created fresh, and the `connect()` call may not have completed setup when the visuals arrive.

### B. Fix: Send Visuals AFTER the Greeting
In `services/api/app/routers/conversations.py`, move the topic visual sending to AFTER the `assistant_complete` message for the greeting:

```python
# AFTER streaming the greeting and sending assistant_complete:
# THEN send topic visuals for the first section
if course_outline and len(course_outline) > 0:
    first_section = course_outline[0]
    if first_section.get("visuals"):
        for visual in first_section["visuals"]:
            await websocket.send_json({
                "type": "topic_visual",
                "visual_type": visual.get("type"),
                **{k: v for k, v in visual.items() if k != "type"}
            })
```

### C. Fix: Also Send Visuals on Topic Transition
When Nexi transitions to a new topic (scaffold_update with a new topic_id), the backend should send the new topic's visuals. Check that this code path in conversations.py is actually being reached — add logging to verify.

### D. Fix: Nexi Should Proactively Generate Inline Visuals
In `services/api/app/services/nexi_engine.py`, update the system prompt to be more aggressive about using visuals:

Change the current optional instruction to something like:
```
VISUAL AIDS — IMPORTANT: When teaching a concept, you SHOULD include a visual to help the learner understand.
Use this format:
[VISUAL:mermaid|Title of Diagram]
graph TD
    A[Start] --> B[Step 1]
    B --> C[Step 2]
[/VISUAL]

Include a visual in at least every other response during the "teach" and "check_understanding" modes.
Types available: mermaid (flowcharts, mind maps), table (comparison tables), chart (bar/pie/line charts).
```

### E. Frontend Visual Rendering Check
In `apps/web/src/app/session/[id]/page.tsx` around line 527, verify the visual detection logic works:
```tsx
// This parse logic should work — but verify visuals aren't being filtered out elsewhere
let visualData = null;
try {
  const parsed = JSON.parse(msg.content);
  if (parsed._visual) visualData = parsed;
} catch {}
```

Make sure the visual message isn't being skipped by any filtering (e.g., empty content check, length check, etc.)

### F. Files to Edit
- `services/api/app/routers/conversations.py` — fix visual sending timing (after greeting, not before)
- `services/api/app/services/nexi_engine.py` — make visuals more prominent in system prompt
- `apps/web/src/hooks/useArenaSocket.ts` — add console.log to topic_visual/inline_visual cases for debugging
- `apps/web/src/app/session/[id]/page.tsx` — verify visual rendering path

### G. Quick Debug Steps
1. Open browser DevTools console during a session
2. Look for `topic_visual` or `inline_visual` WebSocket messages
3. If they arrive → frontend rendering issue
4. If they don't arrive → backend isn't sending them (check if `course.course_outline` has visuals)
5. Query the DB: `SELECT course_outline FROM courses WHERE id = '<course_id>'` — check if visuals array exists in each section

---

## Priority Order
1. Fix visuals not rendering (timing fix in conversations.py) — quick win
2. Make Nexi generate inline visuals more aggressively (nexi_engine.py prompt update)
3. Revamp analytics page with course selector and real data
4. Add the analytics API endpoint
