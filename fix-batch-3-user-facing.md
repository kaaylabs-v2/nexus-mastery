# Batch 3: User-Facing Fixes — Things That Make the App Look Broken

> **PRIORITY**: HIGH — These are the issues users see immediately.
> **ESTIMATED TIME**: 2-3 hours
> **DEPENDENCIES**: Batch 1 (commits work) and Batch 2 (auth works).
> **NOTE TO INTERN**: If you're rebuilding the UI, use this as a checklist. Every item here is a mistake the current UI makes — don't repeat them in the new design.
> **RULE**: Every fix must be verified in a real browser. Take a screenshot before and after.

---

## Fix 1: Replace hardcoded `session-1` links with real conversation creation

**File**: `apps/web/src/app/page.tsx`

Lines 95 and 219 link to `/session/session-1`. The `useArenaSocket` hook sees `session-1`, decides it's not a real UUID, enters mock mode, and returns canned responses. Nexi never actually talks to the learner.

```typescript
// Add at the top of the component:
const [startingSession, setStartingSession] = useState(false);
const router = useRouter(); // from next/navigation

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

// Line ~95 — Replace <Link href="/session/session-1"> with:
<button
  onClick={() => handleStartSession()}
  disabled={startingSession}
  className="..." // keep existing classes
>
  {startingSession ? "Starting..." : "Enter Arena"}
</button>

// Line ~219 — Replace <Link href="/session/session-1"> with:
<button onClick={() => handleStartSession(course.id)}>
  Start
</button>
```

**VERIFY**: Click "Enter Arena" → URL should contain a real UUID like `/session/a1b2c3d4-...`, NOT `/session/session-1`. Nexi should give a real, contextual response.

---

## Fix 2: Render markdown properly in Nexi's chat messages

**File**: `apps/web/src/app/session/[id]/page.tsx`

Nexi's responses contain markdown (`#`, `**`, `---`) but they're displayed as raw text.

```bash
cd apps/web && npm install react-markdown @tailwindcss/typography
```

```tsx
import ReactMarkdown from "react-markdown";

// Find where Nexi messages are rendered. Replace:
<p>{msg.content}</p>

// With:
<div className="prose prose-sm max-w-none text-foreground">
  <ReactMarkdown>{msg.content}</ReactMarkdown>
</div>

// Also for streaming content:
<div className="prose prose-sm max-w-none text-foreground">
  <ReactMarkdown>{streamingContent}</ReactMarkdown>
</div>
```

Add the typography plugin to Tailwind config:
```javascript
// tailwind.config.js or tailwind.config.ts
plugins: [require("@tailwindcss/typography")]
```

**VERIFY**: Start a session, ask Nexi a question. Response should show properly formatted headings, bold text, and lists — NOT raw `#` or `**` symbols.

---

## Fix 3: Fix [object Object] alert on enrollment failure

**File**: `apps/web/src/app/courses/page.tsx`

The enrollment error handler does `alert(String(e))` which shows `[object Object]`.

```typescript
// Replace alert(String(e)) or alert(e) with:
const [enrollError, setEnrollError] = useState<string | null>(null);

const handleEnroll = async (courseId: string) => {
  setEnrolling(courseId);
  setEnrollError(null);
  try {
    await apiClient.enrollInCourse(courseId);
    const course = available.find((c) => c.id === courseId);
    if (course) {
      setAvailable((prev) => prev.filter((c) => c.id !== courseId));
      setEnrolled((prev) => [...prev, course]);
    }
  } catch (e: any) {
    const message = e instanceof Error ? e.message : e?.detail || "Enrollment failed. Please try again.";
    setEnrollError(message);
  } finally {
    setEnrolling(null);
  }
};

// In JSX, add an error banner:
{enrollError && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
    {enrollError}
    <button onClick={() => setEnrollError(null)} className="ml-2 underline">Dismiss</button>
  </div>
)}
```

Also fix the API client to throw proper Error objects:

**File**: `apps/web/src/lib/api-client.ts`
```typescript
// Find where errors are thrown. Replace:
throw error;  // or throw data;

// With:
const err = new Error(error?.detail || error?.message || "Request failed");
(err as any).status = response.status;
throw err;
```

**VERIFY**: Force an enrollment error (e.g., enroll in a course you're already enrolled in). Should see a red error banner with a human-readable message, NOT `[object Object]`.

---

## Fix 4: Remove silent mock data fallback

**File**: `apps/web/src/contexts/LearnerContext.tsx`

When the API fails, this file silently falls back to hardcoded mock data. Users see a fully populated dashboard with fake data and have no idea it's not real.

```typescript
// Find the fallback pattern — something like:
// console.info("API failed, using mock data");
// return MOCK_DATA;

// Replace with:
} catch (error) {
  console.error("Failed to load learner data:", error);
  setError("Unable to load your data. Please check your connection and try again.");
  setLoading(false);
  // Do NOT fall back to mock data
}

// Add error state:
const [error, setError] = useState<string | null>(null);

// Export the error so pages can display it:
return (
  <LearnerContext.Provider value={{ ...data, loading, error }}>
    {children}
  </LearnerContext.Provider>
);
```

**VERIFY**: Stop the API server → load the learner dashboard → should see an error message, NOT a dashboard full of fake data.

---

## Fix 5: Fix status badge labels

**File**: `apps/web/src/app/page.tsx`

The status badge ternary only handles "critical" and "attention". "Proficient" and "advanced" both show as "Attention".

```tsx
// Find:
{skill.status === "critical" ? "Critical" : "Attention"}

// Replace with:
{{ critical: "Critical", attention: "Attention", proficient: "Proficient", advanced: "Advanced" }[skill.status] || skill.status}
```

Also update the color mapping if it only handles two states:
```tsx
// Find the color/className logic and ensure all 4 states have distinct styles:
const statusColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  attention: "bg-yellow-100 text-yellow-700",
  proficient: "bg-blue-100 text-blue-700",
  advanced: "bg-green-100 text-green-700",
};
```

**VERIFY**: Check the dashboard. If any skill has "proficient" or "advanced" status, it should show the correct label and color.

---

## Fix 6: Remove broken sidebar links

**File**: `apps/web/src/components/layout/sidebar.tsx`

Analytics, Journal, and Profile pages are just empty placeholders. Remove them from the sidebar until they're actually built.

```typescript
// Find the navItems array and comment out or remove unfinished pages:
const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  // TODO: Uncomment when implemented
  // { href: "/analytics", label: "Analytics", icon: BarChart3 },
  // { href: "/journal", label: "Journal", icon: BookOpen },
  // { href: "/profile", label: "Profile", icon: User },
];
```

**VERIFY**: Click every link in the sidebar. None should lead to a blank page or placeholder.

---

## Fix 7: Remove dead buttons

**File**: `apps/web/src/app/session/[id]/page.tsx`

The Lightbulb button, Search button, and Notification bell have no onClick handlers. They look clickable but do nothing.

Either implement them or remove them:
```tsx
// If removing — delete the button elements entirely
// If keeping as future placeholders — add disabled state and tooltip:
<button disabled title="Coming soon" className="opacity-50 cursor-not-allowed">
  <Lightbulb size={18} />
</button>
```

**File**: `apps/web/src/components/ui/mastery-card.tsx`
- Fix the link to `/sessions` — this route doesn't exist. Either link to `/courses` or remove the link.

**VERIFY**: No button on any page should appear clickable if it does nothing.

---

## Fix 8: Add error states to all data-fetching pages

Every page that calls the API needs to handle failure. Replace all `.catch(console.error)`, `.catch(() => {})`, and `.catch(() => null)` with visible error states.

Apply this pattern to every page that fetches data:

```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  fetchData()
    .then(setData)
    .catch((e) => setError(e?.message || "Failed to load data"))
    .finally(() => setLoading(false));
}, []);

// In JSX:
{loading && <LoadingSpinner />}
{error && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    {error}
    <button onClick={() => { setError(null); setLoading(true); fetchData()...; }}>
      Retry
    </button>
  </div>
)}
{data && <ActualContent data={data} />}
```

**Pages to fix (check each one)**:
- `apps/web/src/app/page.tsx` (learner dashboard)
- `apps/web/src/app/courses/page.tsx`
- `apps/admin/src/app/page.tsx` (admin dashboard)
- `apps/admin/src/app/programs/page.tsx`
- `apps/admin/src/app/programs/[id]/page.tsx`
- `apps/admin/src/app/users/page.tsx`
- `apps/admin/src/app/analytics/page.tsx`
- `apps/admin/src/app/settings/page.tsx`

**VERIFY**: Stop the API → load each page → should see an error message with a retry button, NOT a blank page or mock data.

---

## Done criteria
- "Enter Arena" creates real conversations (URL has UUID, not `session-1`)
- Nexi responses render markdown properly (no raw # or **)
- Enrollment errors show human-readable messages (no `[object Object]`)
- API failure shows error state (no silent mock data fallback)
- Status badges show all 4 labels correctly
- Sidebar has no dead links
- No buttons appear clickable without working
- Every data-fetching page handles errors visibly
