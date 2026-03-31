# Batch 5: Polish — Nice to Have Before Launch

> **PRIORITY**: LOW — Do these when Batches 1-4 are done and stable.
> **ESTIMATED TIME**: 2-3 hours
> **DEPENDENCIES**: All previous batches.
> **RULE**: These are quality-of-life improvements. Each one is small and independent.

---

## Fix 1: Fix analytics enrollment counts

**File**: `services/api/app/routers/admin.py` — `analytics_overview`

The `top_programs` metric hardcodes `total_learners` for every program instead of counting actual per-program enrollments.

```python
top_programs = []
for p in programs[:5]:
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

## Fix 2: Fix admin settings page — replace fake data with real API

**File**: `apps/admin/src/app/settings/page.tsx`

The settings page has hardcoded mock API keys and webhooks. SSO toggle resets on page reload.

```typescript
// Replace hardcoded state with API calls:
const [settings, setSettings] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [saving, setSaving] = useState(false);

useEffect(() => {
  apiClient.getOrgSettings()
    .then(setSettings)
    .catch((e) => setError(e?.message || "Failed to load settings"))
    .finally(() => setLoading(false));
}, []);

const handleSave = async () => {
  setSaving(true);
  try {
    await apiClient.updateOrgSettings(settings);
    // Show success toast or message
  } catch (e: any) {
    setError(e?.message || "Failed to save settings");
  } finally {
    setSaving(false);
  }
};
```

If the backend settings endpoints don't support all the fields shown in the UI, either add the backend support or remove the unsupported fields from the UI. Don't show controls that don't actually do anything.

---

## Fix 3: Fix admin analytics page — use real data

**File**: `apps/admin/src/app/analytics/page.tsx`

The entire page uses hardcoded static data instead of fetching from the API.

```typescript
useEffect(() => {
  apiClient.getAnalyticsOverview()
    .then(setData)
    .catch((e) => setError(e?.message || "Failed to load analytics"))
    .finally(() => setLoading(false));
}, []);
```

Make sure the API endpoint (`/api/admin/analytics`) returns all the fields the frontend expects. If it doesn't, update the backend or simplify the frontend to match what's available.

---

## Fix 4: Fix admin upload progress — make it real

**File**: `apps/admin/src/app/upload/page.tsx`

The upload progress advances on a 2.5-second timer regardless of actual ingestion status.

```typescript
// Replace the setTimeout-based progress with real polling:
const pollIngestionStatus = async (jobId: string, attempt = 0) => {
  const maxAttempts = 30;
  const delay = Math.min(2000 * Math.pow(1.3, attempt), 15000); // 2s → 15s max

  if (attempt >= maxAttempts) {
    setError("Processing is taking longer than expected. Check the dashboard for status.");
    return;
  }

  try {
    const status = await apiClient.getIngestionStatus(jobId);
    setProgress(status.progress || 0);
    setCurrentStep(status.current_step || "Processing...");

    if (status.status === "completed") {
      setProgress(100);
      setCurrentStep("Done!");
      return;
    }
    if (status.status === "failed") {
      setError(status.error_message || "Processing failed.");
      return;
    }

    // Still processing — poll again with backoff
    setTimeout(() => pollIngestionStatus(jobId, attempt + 1), delay);
  } catch (e) {
    setError("Lost connection to the server. Your upload may still be processing.");
  }
};
```

---

## Fix 5: Fix admin sidebar — add logout, fix hardcoded email

**File**: `apps/admin/src/components/admin-sidebar.tsx`

The `LogOut` icon is imported but never used. The email shows `admin@acme.com` instead of the real user's email.

```tsx
// Fix email — use real user data:
const { user } = useAuth(); // or however you get the current user
// Replace: "admin@acme.com"
// With: {user?.email || "Loading..."}

// Add logout button at the bottom of the sidebar:
<button
  onClick={() => signOut()}
  className="flex items-center gap-2 p-2 mt-auto text-red-600 hover:bg-red-50 rounded-lg transition-colors"
>
  <LogOut size={18} />
  <span>Sign Out</span>
</button>
```

---

## Fix 6: Fix admin "New Program" button

**File**: `apps/admin/src/app/programs/page.tsx`

The "New Program" button has no onClick handler.

Either add a create modal or navigate to a create form:
```tsx
const [showCreateForm, setShowCreateForm] = useState(false);

// On the button:
<button onClick={() => setShowCreateForm(true)}>
  New Program
</button>

// Add a simple create form/modal:
{showCreateForm && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-96">
      <h2 className="text-lg font-semibold mb-4">Create Program</h2>
      <input
        placeholder="Program name"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="w-full border rounded p-2 mb-3"
      />
      <textarea
        placeholder="Description"
        value={newDesc}
        onChange={(e) => setNewDesc(e.target.value)}
        className="w-full border rounded p-2 mb-4"
        rows={3}
      />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setShowCreateForm(false)}>Cancel</button>
        <button onClick={handleCreateProgram} className="bg-blue-600 text-white px-4 py-2 rounded">
          Create
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Fix 7: Fix email validation in bulk user import

**File**: `services/api/app/routers/admin.py` — `bulk_import_users`

Currently validates emails with just `"@" not in email`. Use a proper regex.

```python
import re
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Replace:
if "@" not in email:

# With:
if not EMAIL_REGEX.match(email.strip()):
    errors.append(f"Row {i}: Invalid email format: '{email}'")
    continue
```

---

## Fix 8: Add request timeouts to all frontend fetch calls

**File**: `apps/web/src/lib/api-client.ts`
**File**: `apps/admin/src/lib/api-client.ts`

All `fetch()` calls can hang indefinitely. Add timeouts:

```typescript
// Create a helper function:
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// Then replace all fetch() calls with fetchWithTimeout()
```

---

## Fix 9: Make chunking config values configurable

**File**: `services/api/app/services/rag_pipeline.py`

```python
# Replace:
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

# With:
import os
CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "200"))
```

---

## Fix 10: Make ElevenLabs voice ID configurable

**File**: `services/api/app/services/voice_service.py`

```python
# Replace:
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

# With:
import os
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
```

---

## Fix 11: Clean up unused imports and dead components

Search for and remove:
```bash
# Find unused imports across the codebase:
grep -rn "import.*SessionStepper" apps/ --include="*.tsx" --include="*.ts"
grep -rn "import.*Skeleton" apps/ --include="*.tsx" --include="*.ts"
grep -rn "import.*Topbar" apps/ --include="*.tsx" --include="*.ts"

# For each import found, check if the component is actually used in that file.
# If not, remove the import line.
# If the component file itself is never imported anywhere, delete it.
```

---

## Fix 12: Add basic accessibility

Quick wins across the app:

```tsx
// Add aria-labels to icon-only buttons:
<button aria-label="Notifications"><Bell size={18} /></button>
<button aria-label="Search"><Search size={18} /></button>

// Add alt text to all images:
<img alt="User avatar" src={...} />
<img alt="Course thumbnail" src={...} />

// Ensure color-only indicators also have text:
// Instead of just a red/green dot, add "Active"/"Inactive" text
```

---

## Done criteria
- Analytics shows real per-program enrollment counts
- Settings page loads/saves real org settings
- Analytics page fetches real data from API
- Upload progress reflects actual ingestion status
- Logout button works in admin
- Admin sidebar shows real user email
- "New Program" button opens a create form
- Email validation uses regex, not just `@` check
- All fetch calls have 15-second timeouts
- Chunk size/overlap and voice ID are configurable via env vars
- No unused imports or dead component files
- Icon buttons have aria-labels
