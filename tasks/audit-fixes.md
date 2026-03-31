# Mastery Code Audit — Fix Prompt for Claude Code

Paste this into Claude Code as a single prompt:

---

I need you to fix bugs across the Mastery codebase. Work through each fix one at a time. After EACH fix, run `npx tsc --noEmit` in the relevant app AND `python -m py_compile` on any changed Python file to verify nothing is broken before moving to the next fix. DO NOT batch fixes — do them sequentially and verify after each one.

**CRITICAL RULES:**
- DO NOT remove or change the dev auth tokens. `DEV_TOKEN` in both api-client.ts files MUST stay as-is. The app uses DEV_AUTH mode right now.
- DO NOT change relative/absolute API URLs. All fetch calls to the FastAPI backend must use `API_BASE` or the existing api client helpers (`adminApi.*`, `apiClient.*`). Never use relative URLs like `/api/...` for backend calls.
- DO NOT change SQLAlchemy column types (e.g. String to Enum) without creating an Alembic migration. If a fix requires a schema change, skip it and note it as "needs migration".
- DO NOT change Pydantic model fields that would break existing API contracts.
- After ALL fixes are done, run both apps' TypeScript compilation AND parse all Python files to confirm zero errors.

## Fix 1: Voice Mode — TTS playback + mic not re-activating

The voice conversation loop is broken. When you click the voice mode button:
1. The mic records and sends to STT correctly
2. The AI responds with text
3. TTS audio DOES NOT play (or plays but the user can't hear it)
4. After the response, the mic does NOT re-activate for the next turn

Root causes to fix in `apps/web/src/hooks/useVoice.ts`:
- In `playAudioBuffer`: the `audio.onerror` handler and the `audio.play().catch()` handler both resolve the promise but do NOT call `opts?.onPlaybackEnded?.()`. This means the voice loop dies silently on any TTS error. Fix: call `onPlaybackEnded` in both error paths.
- Add a safety timeout (60s) in case audio playback gets stuck — force cleanup and call onPlaybackEnded.

Root cause to fix in `apps/web/src/app/session/[id]/page.tsx`:
- `handlePlaybackEnded` has an empty dependency array `[]` but references `voiceStartRecording` which comes from `useVoice`. This is a stale closure — the function captured at mount time doesn't work. Fix: use a `useRef` to hold the latest `voiceStartRecording` function, and read from the ref inside `handlePlaybackEnded`. This breaks the circular dependency (handlePlaybackEnded → voiceStartRecording → useVoice(handlePlaybackEnded)).
- In `playTTS`'s catch block: if the TTS API call itself fails, the mic should still re-activate in voice mode. Add a fallback that calls `voiceStartRecordingRef.current()` after a short delay.

## Fix 2: Error handling — replace silent `.catch(() => {})`

Search both `apps/admin/` and `apps/web/` for `.catch(() => {})`, `.catch(console.error)`, and `.catch(() => null)`. For each one:
- Add `const [error, setError] = useState<string | null>(null)` to the component if not already present
- Replace the silent catch with `setError("Failed to load X. Please try again.")`
- Add an error banner UI near the top of the page content (a red/amber border div with the error message and a dismiss button)
- Import `AlertCircle` from lucide-react for the error icon

Pages to check: admin dashboard (page.tsx), courses, users, analytics, users/[id]. Web app: page.tsx, courses, history.

## Fix 3: Unsafe JSONB access in backend

In `services/api/app/services/quiz_generator.py`, the `generate_quiz` function accesses `course_outline` items with `.get("title")` without checking if items are dicts. Wrap the section extraction in a try/except:

```python
try:
    if isinstance(course_outline, list):
        sections = [s.get("title", "") for s in course_outline[:12] if isinstance(s, dict)]
        sections = [s for s in sections if s]
        if sections:
            context_parts.append(f"SECTIONS: {', '.join(sections)}")
except (TypeError, AttributeError):
    pass
```

## Fix 4: Progress bar width clamping

In `apps/admin/src/app/page.tsx` (dashboard), the category progress bars use `style={{ width: \`${cat.avg_progress}%\` }}`. Clamp this to 0-100: `Math.min(100, Math.max(0, cat.avg_progress))`.

Same fix in `apps/admin/src/app/upload/page.tsx` for `job.progress_pct`.

## Fix 5: Missing periods on empty states

Search both admin and web apps for empty state text like `"No courses yet"`, `"No users yet"`, `"No category data yet"`, `"No courses match your filters"`. Add periods to the end of each sentence.

## Fix 6: buildAssetUrl helper for thumbnail URLs

In `apps/admin/src/lib/api-client.ts`, add this exported helper function (after the imports, before getToken):

```typescript
export function buildAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}
```

Then in `apps/admin/src/app/page.tsx` and `apps/admin/src/app/courses/page.tsx`, replace the inline thumbnail URL construction:
```
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const thumbSrc = course.thumbnail_url ? (course.thumbnail_url.startsWith("http") ? course.thumbnail_url : `${apiBase}${course.thumbnail_url}`) : null;
```
with:
```
import { buildAssetUrl } from "@/lib/api-client";
const thumbSrc = buildAssetUrl(course.thumbnail_url);
```

## Fix 7: Settings page — mark SSO as coming soon

In `apps/admin/src/app/settings/page.tsx`, the SSO toggle doesn't persist state. Replace the functional toggle with a disabled toggle and a "Coming Soon" badge. Remove the `ssoEnabled` state variable and the expandable SSO config form below it (the SAML URL, certificate fields etc).

## Fix 8: localStorage try-catch

In `apps/web/src/app/session/[id]/page.tsx`, wrap the `getAutoReadPref()` function's localStorage access in a try-catch that returns `true` as default on failure.

## Fix 9: Add generateThumbnail to admin API client

In `apps/admin/src/lib/api-client.ts`, add to the `adminApi` object:
```typescript
generateThumbnail: (id: string) => authRequest<{ thumbnail_url: string }>(`/api/courses/${id}/generate-thumbnail`, { method: "POST" }),
```

Then in `apps/admin/src/app/courses/page.tsx`, replace the direct `fetch()` call in `handleGenerateThumbnail` with `adminApi.generateThumbnail(course.id)`.

---

After all fixes, run:
1. `cd apps/admin && npx tsc --noEmit` — must have zero errors
2. `cd apps/web && npx tsc --noEmit` — must have zero errors
3. `cd services/api && python -c "import ast, os; [ast.parse(open(os.path.join(r,f)).read()) for r,_,fs in os.walk('app') for f in fs if f.endswith('.py')]"` — must have zero errors
