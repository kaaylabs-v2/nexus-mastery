# Mastery Code Audit — Fix Prompt for Claude Code

Paste everything below the `---` line into Claude Code as a single prompt.

---

I need you to fix voice mode bugs in the Mastery learner app. The voice conversation mode is broken in multiple ways. Work through each fix one at a time. After EACH fix, run `cd apps/web && npx tsc --noEmit` to verify nothing is broken before moving on.

**CRITICAL RULES:**
- DO NOT remove or change the dev auth tokens (`DEV_TOKEN`) in any api-client.ts file.
- DO NOT change API URLs — all fetch calls to the FastAPI backend must use `API_BASE` or the existing api client helpers.
- DO NOT change SQLAlchemy column types without an Alembic migration.
- DO NOT change Pydantic model fields that would break existing API contracts.

Read these files before starting:
- `apps/web/src/hooks/useVoice.ts`
- `apps/web/src/app/session/[id]/page.tsx` (the whole file)

---

## Bug 1: Auto-read fires on session resume and reads old messages

**Symptom:** When re-entering an existing session that already has messages, auto-read immediately starts reading the last Nexi message out loud — even though the user didn't ask for it.

**Root cause:** In `session/[id]/page.tsx` around line 248-255:

```tsx
useEffect(() => {
  if (!autoRead) return;
  const lastMsg = liveMessages[liveMessages.length - 1];
  if (!lastMsg || lastMsg.role !== "nexi") return;
  if (playingMsgId === lastMsg.id) return;
  playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead]);
```

This effect triggers whenever `liveMessages` changes. When the user resumes a session, `loadExistingMessages` populates `liveMessages` with all the old messages at once. Since `autoRead` defaults to `true` (from localStorage where it was saved as `"true"` from a previous voice session), it immediately reads the last message.

**Fix:** Add a ref `hasInitializedRef` that starts as `false`. Set it to `true` after a short delay (e.g. 2 seconds) via a separate useEffect. In the auto-read effect, skip if `!hasInitializedRef.current`. This gives the session time to load existing messages without triggering auto-read.

Also: change `getAutoReadPref()` to default to `false` instead of `true`. Auto-read should only be on when the user explicitly enables voice mode. The current default of `true` is backwards — it means every session starts auto-reading.

```tsx
function getAutoReadPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem("arena-auto-read");
    return val === "true"; // default false if null
  } catch { return false; }
}
```

---

## Bug 2: Multiple TTS streams play simultaneously (audio jamming)

**Symptom:** When the user clicks the mic icon while TTS is already playing in the background, the old audio keeps playing AND a new response starts playing, causing garbled overlapping audio.

**Root cause:** `playAudioBuffer` in `useVoice.ts` creates a new `Audio()` element each time and sets `audioRef.current = audio`. But it does NOT stop the previous audio first. If `playTTS` is called while an old `playAudioBuffer` promise is still running, two `Audio` elements play at the same time.

Also in the session page, `handleMic` (around line 400) calls `stopTTS()` before starting recording, which sets `playingMsgId = null` and calls `stopTTSAudio()` — but `stopTTSAudio` only pauses `audioRef.current`. If the previous `playAudioBuffer` promise resolved with a different audio element, the old one is orphaned and keeps playing.

**Fix in `useVoice.ts` `playAudioBuffer`:** At the very top of the function, before creating the new Audio element, stop and clean up any currently playing audio:

```tsx
const playAudioBuffer = useCallback(async (audioBuffer: ArrayBuffer) => {
  // Stop any currently playing audio first to prevent overlap
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.onended = null;
    audioRef.current.onerror = null;
    audioRef.current = null;
  }

  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  // ... rest of function
```

---

## Bug 3: Mic does not re-activate after the tutor finishes speaking

**Symptom:** In voice mode, after the tutor's TTS audio finishes playing, the mic does not start listening again. The voice loop dies.

**Root cause:** Check `handlePlaybackEnded` — it reads `voiceModeRef.current` and calls `voiceStartRecordingRef.current()`. Verify that:
1. `voiceModeRef.current` is actually `true` at the time playback ends (it's set by a useEffect syncing `voiceMode` → `voiceModeRef.current`, but React's batched updates may mean the ref isn't set yet if voice mode was just toggled)
2. `voiceStartRecordingRef.current` is the actual `startRecording` function and not the initial `() => {}` empty function

Also verify: when `playTTS` calls `await playAudioBuffer(audioBuffer)` and then sets `setPlayingMsgId(null)`, this does NOT interfere with the `onPlaybackEnded` callback. The issue is that `playAudioBuffer` calls `cleanup` which calls `onPlaybackEnded`, but by that time `playingMsgId` is still set. Verify the `playingMsgId === lastMsg.id` guard in the auto-read effect isn't causing the auto-read to re-trigger after playback ends (since `playingMsgId` gets set to `null`, the effect might fire again for the same message).

**Fix:** Add a `readMessagesRef` (a Set of message IDs that have already been read aloud) to prevent the auto-read effect from re-reading the same message:

```tsx
const readMessagesRef = useRef<Set<string>>(new Set());

useEffect(() => {
  if (!autoRead || !hasInitializedRef.current) return;
  const lastMsg = liveMessages[liveMessages.length - 1];
  if (!lastMsg || lastMsg.role !== "nexi") return;
  if (readMessagesRef.current.has(lastMsg.id)) return;
  readMessagesRef.current.add(lastMsg.id);
  playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead]);
```

This replaces the `playingMsgId` guard which is fragile because `playingMsgId` gets reset to `null` after playback, causing the effect to think the message hasn't been read yet.

---

## Bug 4: stopAudio doesn't fully clean up

**Symptom:** After calling stopAudio (e.g. when exiting voice mode or clicking mute), audio sometimes continues playing or the state gets stuck.

**Fix in `useVoice.ts` `stopAudio`:** Null out the ref and remove event handlers:

```tsx
const stopAudio = useCallback(() => {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.onended = null;
    audioRef.current.onerror = null;
    audioRef.current.currentTime = 0;
    audioRef.current = null;
    setIsPlaying(false);
  }
}, []);
```

---

## Bug 5: Voice mode toggle doesn't stop current TTS before starting mic

**Symptom:** When entering voice mode while auto-read is already playing something, the TTS keeps playing while the mic starts recording, causing the mic to pick up the TTS audio as "user speech."

**Fix in `toggleVoiceMode`:** When entering voice mode, stop any current TTS first, THEN start recording after a delay:

```tsx
const toggleVoiceMode = useCallback(() => {
  if (voiceMode) {
    setVoiceMode(false);
    stopTTS();
  } else {
    stopTTS(); // Stop any currently playing audio first
    setVoiceMode(true);
    setAutoRead(true);
    try { localStorage.setItem("arena-auto-read", "true"); } catch {}
    // Wait for TTS to fully stop before starting mic
    setTimeout(() => voiceStartRecording(), 500);
  }
}, [voiceMode, setVoiceMode, stopTTS, voiceStartRecording]);
```

---

After all voice fixes, also do these quick non-voice fixes:

## Fix 6: Error handling — replace silent `.catch(() => {})`

Search both `apps/admin/` and `apps/web/` for `.catch(() => {})` and `.catch(console.error)`. For each page component that has one:
- Add `const [error, setError] = useState<string | null>(null)` if not present
- Replace the silent catch with `.catch((e) => { console.error(e); setError("Failed to load data."); })`

Don't add error UI — just capture the error in state for now. The important thing is to stop swallowing errors silently.

## Fix 7: Progress bar width clamping

In `apps/admin/src/app/page.tsx`, the category progress bars use `style={{ width: \`${cat.avg_progress}%\` }}`. Clamp to 0-100: `Math.min(100, Math.max(0, cat.avg_progress))`.

Same in `apps/admin/src/app/upload/page.tsx` for `job.progress_pct`.

## Fix 8: buildAssetUrl helper

In `apps/admin/src/lib/api-client.ts`, add after the existing constants:

```typescript
export function buildAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}
```

Then in `apps/admin/src/app/page.tsx` and `apps/admin/src/app/courses/page.tsx`, replace inline thumbnail URL construction with `buildAssetUrl(course.thumbnail_url)`.

## Fix 9: Add generateThumbnail to admin API client

In `apps/admin/src/lib/api-client.ts`, add to the `adminApi` object near publishCourse/unpublishCourse:
```typescript
generateThumbnail: (id: string) => authRequest<{ thumbnail_url: string }>(`/api/courses/${id}/generate-thumbnail`, { method: "POST" }),
```

Then in `apps/admin/src/app/courses/page.tsx`, replace the direct `fetch()` call in `handleGenerateThumbnail` with `adminApi.generateThumbnail(course.id)`.

---

After ALL fixes, run:
1. `cd apps/web && npx tsc --noEmit` — zero errors
2. `cd apps/admin && npx tsc --noEmit` — zero errors
3. `cd services/api && python -c "import ast, os; [ast.parse(open(os.path.join(r,f)).read()) for r,_,fs in os.walk('app') for f in fs if f.endswith('.py')]"` — zero errors
