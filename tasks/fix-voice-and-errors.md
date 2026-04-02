# Fix Voice Playback, Console Errors, and Course Outline Loading

## CRITICAL RULES — READ BEFORE TOUCHING ANYTHING:
- Do NOT remove dev auth tokens. `DEV_TOKEN = "dev:auth0|learner-maria"` and `"dev:auth0|admin-james"` are INTENTIONAL.
- Do NOT change `API_BASE` or any URLs from absolute (`http://localhost:8000`) to relative (`/api/...`).
- Do NOT change database column types or add migrations.
- Do NOT change `getAutoReadPref()` — it correctly defaults to `false`.
- `DEV_AUTH=true` in `services/api/.env` must stay.
- Start BOTH servers before any testing:
  - `cd services/api && uvicorn app.main:app --port 8000 --reload`
  - `cd apps/web && npm run dev`

---

## CONTEXT — What the user is seeing:
1. Voice mode: user speaks, Nexi responds with text, but NO AUDIO plays back
2. Console error: "Failed to load learner data: {}" from `LearnerContext.tsx:250`
3. Console TypeError: "Load failed"
4. Sidebar shows generic "Session phases" (Getting Started / Learn / Understand / Think Deeper) instead of the actual course topics
5. Score stuck at 0%

ALL of issues 4 and 5 have the same root cause: the course outline is not being sent to the frontend. The sidebar already has full code to display course topics, progress bars, and current topic — it just needs the data.

---

## Issue 1: Voice — user does not hear Nexi talking back

### Step 1: Test TTS backend directly
```bash
curl -v -X POST http://localhost:8000/api/voice/tts \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is a test."}' \
  --output /tmp/test-tts.mp3 2>&1

# Check if we got audio data:
ls -la /tmp/test-tts.mp3
# Should be > 1KB. If 0 bytes or error, ElevenLabs API key may be expired.
```

**If curl returns 401**: Auth issue — check that `get_current_user` in `services/api/app/routers/voice.py` works with dev tokens.

**If curl returns 500 or empty**: Check `ELEVENLABS_API_KEY` in `services/api/.env`. The key might be expired. Check the API logs for the actual error. If expired, tell user to update the key.

**If curl returns audio data** (file > 1KB): Backend is fine, problem is frontend. Continue to Step 2.

### Step 2: Trace the frontend TTS chain

Open browser DevTools console and add these temporary logs to trace the issue:

**In `apps/web/src/app/session/[id]/page.tsx`**, inside the auto-read `useEffect` (~line 260):
```typescript
useEffect(() => {
  if (!autoRead || !sessionReadyRef.current) {
    console.log("[TTS Debug] Skipped:", { autoRead, sessionReady: sessionReadyRef.current });
    return;
  }
  const lastMsg = liveMessages[liveMessages.length - 1];
  if (!lastMsg || lastMsg.role !== "nexi") return;
  if (readMessagesRef.current.has(lastMsg.id)) return;
  console.log("[TTS Debug] Auto-reading message:", lastMsg.id);
  readMessagesRef.current.add(lastMsg.id);
  playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead]);
```

**In `apps/web/src/app/session/[id]/page.tsx`**, in the `playTTS` function (~line 269):
```typescript
const playTTS = useCallback(async (msgId: string, text: string) => {
  console.log("[TTS Debug] playTTS called for:", msgId, "text length:", text.length);
  try {
    setPlayingMsgId(msgId);
    const { apiClient } = await import("@/lib/api-client");
    const audioBuffer = await apiClient.textToSpeech(text);
    console.log("[TTS Debug] Got audio buffer, size:", audioBuffer.byteLength);
    await playAudioBuffer(audioBuffer);
    console.log("[TTS Debug] Audio playback complete");
    setPlayingMsgId(null);
  } catch (err) {
    console.error("[TTS Debug] FAILED:", err);
    setPlayingMsgId(null);
  }
}, [playAudioBuffer]);
```

**In `apps/web/src/lib/api-client.ts`**, in the `textToSpeech` method (~line 367):
Verify `await this.ensureToken()` exists as the FIRST line. If missing, add it — this was the original TTS bug (every request failed with 401).

### Step 3: Check browser autoplay

If the buffer arrives but no sound plays, it's a browser autoplay issue. In `apps/web/src/hooks/useVoice.ts`, in `playAudioBuffer` (~line 187), check if `audio.play()` is throwing:

The `.catch(cleanup)` on `audio.play()` silently swallows autoplay errors. Change it temporarily to:
```typescript
audio.play().catch((err) => {
  console.error("[Voice] audio.play() FAILED:", err.name, err.message);
  cleanup();
});
```

If you see `NotAllowedError`: the browser is blocking autoplay. Voice mode toggle (user click) should unlock this. Check that `toggleVoiceMode` is being called before TTS tries to play.

### Step 4: After finding the root cause, fix it and REMOVE all debug logs.

---

## Issue 2: Console Error — "Failed to load learner data: {}"

**File:** `apps/web/src/contexts/LearnerContext.tsx` line 249-253

**Root cause:** `GET /api/categories/active/me` returns 404 when no categories exist (happens after data reset or on fresh installs). Already caught, but logs a scary error.

**Fix:** Suppress the 404 case since it's expected:
```typescript
} catch (error: unknown) {
  // 404 is expected when no categories exist yet — only log unexpected errors
  const status = error && typeof error === 'object' && 'status' in error ? (error as { status: number }).status : 0;
  if (status !== 404) {
    console.error("Failed to load learner data:", error);
  }
}
```

---

## Issue 3: Console TypeError — "Load failed"

Most likely the Mermaid.js dynamic import failing. Check:

```bash
cd apps/web && npm ls mermaid
```

If mermaid is not installed:
```bash
cd apps/web && npm install mermaid@10
```

Also check `apps/web/src/components/ui/mermaid-diagram.tsx`:
- It should use `import("mermaid")` (dynamic/lazy), NOT `import mermaid from "mermaid"` at the top level.
- Top-level imports of mermaid crash during SSR because mermaid needs `window`/DOM APIs.

If it's still using a top-level import, change to:
```typescript
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = import("mermaid").then((mod) => {
    const m = mod.default;
    m.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
    return m;
  });
  return mermaidReady;
}
```

Then in the useEffect, use `const m = await getMermaid()` instead of the direct import.

---

## Issue 4: Course outline not loading → generic phase names, no topic list, score at 0%

This is the biggest issue. The sidebar ALREADY has full code to show course topics (lines 482-545 of `apps/web/src/app/session/[id]/page.tsx`), but `courseOutline` is always empty because the data never arrives.

### Root cause chain:

1. **Course must have an outline in the database.** Check:
```bash
curl -s http://localhost:8000/api/admin/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -c "
import sys, json
courses = json.load(sys.stdin)
for c in courses:
    outline = c.get('course_outline')
    print(f\"{c['title']}: outline={'YES ('+str(len(outline))+' topics)' if outline else 'NONE'}\")
"
```
If the course has no outline, that's the problem. The outline gets generated during content ingestion or via `POST /api/admin/courses/{id}/generate-outline`. Generate it:
```bash
# Replace COURSE_ID with actual course ID
curl -X POST http://localhost:8000/api/admin/courses/COURSE_ID/generate-outline \
  -H "Authorization: Bearer dev:auth0|admin-james"
```

2. **Server must send outline via WebSocket.** In `services/api/app/routers/conversations.py`, the session_start handler must:
   - For NEW sessions (no messages): generate greeting, then send `outline_update` with the course outline
   - For RESUMED sessions (has messages): send `outline_update` and `scaffold_update` WITHOUT generating a new greeting

   Verify this code exists. Search for `outline_update` in the file. There should be TWO places it's sent:
   - Once in the new session path (after greeting generation)
   - Once in the resumed session path (the `if conversation.messages:` branch)

   If the resumed session path just does `continue` silently, that's the bug. It should send the outline back.

3. **Client must request outline on resume.** In `apps/web/src/hooks/useArenaSocket.ts`, the `ws.onopen` handler:
   - For new sessions: sends `{ type: "session_start" }` with isStreaming=true
   - For resumed sessions (`hasGreetedRef.current` is already true): should STILL send `{ type: "session_start" }` but WITHOUT setting isStreaming or startResponseTimeout

   Check that the `else` branch exists:
   ```typescript
   } else {
     // Resumed session — request outline/scaffold
     ws.send(JSON.stringify({ type: "session_start" }));
   }
   ```
   If this else branch is missing, add it.

4. **The `_greeting_in_progress` guard must not block resumed sessions.** In `conversations.py`, the `_greeting_in_progress` set is used to prevent duplicate greetings. But if a conversation ID gets stuck in this set (e.g., from a previous error), it blocks ALL future session_starts for that conversation.

   Verify that the session_start handler wraps the main logic in `try/finally` with `_greeting_in_progress.discard(conv_key)` in the finally block.

### Quick test after fixing:
Open a session in the browser. Open DevTools → Network → WS tab. Find the WebSocket connection. You should see:
- Client sends: `{"type":"session_start"}`
- Server responds with: `{"type":"outline_update","outline":[...],"current_topic_id":1,"topics_covered":[]}` and `{"type":"scaffold_update",...}`

If you see the outline_update arrive, the sidebar will automatically switch from generic phases to course topics.

---

## Verification checklist — run AFTER all fixes:

```bash
# 1. TypeScript clean
cd apps/web && npx tsc --noEmit && echo "TS: PASS"

# 2. Python clean
cd services/api && python3 -c "
import ast
for f in ['app/routers/conversations.py','app/routers/admin.py','app/services/nexi_engine.py','app/services/response_evaluator.py','app/routers/voice.py']:
    ast.parse(open(f).read()); print(f'OK: {f}')
"

# 3. TTS endpoint returns audio
curl -s -o /tmp/tts.mp3 -w "HTTP %{http_code}, size %{size_download}" \
  -X POST http://localhost:8000/api/voice/tts \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing voice output"}'
# Expected: HTTP 200, size > 1000

# 4. Course has outline
curl -s http://localhost:8000/api/admin/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -c "
import sys,json
for c in json.load(sys.stdin):
    o=c.get('course_outline')
    print(f\"{c['title']}: {'PASS ('+str(len(o))+' topics)' if o else 'FAIL: no outline'}\")
"

# 5. No duplicate categories
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -c "
import sys,json
d=json.load(sys.stdin)
names=[c['name'] for c in d.get('top_categories',[])]
dupes=[n for n in names if names.count(n)>1]
print('PASS' if not dupes else f'FAIL: {set(dupes)}')
"
```

## After verification, open a browser and manually confirm:
1. [ ] Open a course session
2. [ ] Sidebar shows "Course progress (X/Y)" with actual topic names — NOT "Session phases" with generic labels
3. [ ] Top bar shows course topic pills — NOT "Getting Started / Learn / Understand"
4. [ ] Score shows percentage based on topics covered (0% for new session, increasing as you go)
5. [ ] Toggle voice mode on → speak → Nexi responds → you HEAR the response audio
6. [ ] No red console errors (the "Failed to load learner data" 404 should be suppressed)
7. [ ] Mermaid diagrams render inside cards (not blank white boxes)

If any of these fail, report exactly which one and what you see. Do NOT mark as done until ALL 7 pass.
