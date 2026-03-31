# Voice Mode Fix Prompt

Paste everything below the line into Claude Code.

---

The voice conversation mode in the learner app is broken in multiple ways. I'll describe each bug with the exact root cause and fix. Read these two files fully before starting:

- `apps/web/src/hooks/useVoice.ts`
- `apps/web/src/app/session/[id]/page.tsx`

**RULES:**
- DO NOT touch auth tokens, API URLs, or any backend files.
- After EACH fix, run `cd apps/web && npx tsc --noEmit` to verify zero errors before moving to the next.
- Work sequentially — one fix at a time.

---

## Bug 1: Auto-read reads old messages aloud when re-entering a session

When I go back into a session that already has messages, it immediately starts reading the last Nexi message out loud even though I didn't ask for it.

**Root cause:** The auto-read `useEffect` (around line 248-255) fires whenever `liveMessages` changes. When resuming a session, `loadExistingMessages` populates all old messages at once, and since `autoRead` defaults to `true` (from `getAutoReadPref` which defaults to `true`), it immediately reads the last message.

**Fix (two parts):**

**(a)** Change `getAutoReadPref()` to default to `false`. Auto-read should only be on when the user explicitly turns it on. Currently it returns `true` if localStorage has no value — flip that:

```tsx
function getAutoReadPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem("arena-auto-read");
    return val === "true";
  } catch { return false; }
}
```

**(b)** Add an initialization guard so auto-read skips messages that were loaded as part of session resume. Add a ref:

```tsx
const sessionReadyRef = useRef(false);
```

Add a useEffect that sets it to true after a short delay (after existing messages have been loaded):

```tsx
useEffect(() => {
  const timer = setTimeout(() => { sessionReadyRef.current = true; }, 2000);
  return () => clearTimeout(timer);
}, []);
```

Then update the auto-read effect to check it:

```tsx
useEffect(() => {
  if (!autoRead || !sessionReadyRef.current) return;
  // ... rest of effect
}, [liveMessages, autoRead]);
```

---

## Bug 2: Multiple audio streams play at the same time (garbled/overlapping audio)

When I click the mic while something is already playing, the old audio keeps going AND a new response starts — two audio streams overlap and it sounds garbled.

**Root cause:** In `useVoice.ts`, `playAudioBuffer` creates a new `Audio()` element and sets `audioRef.current = audio` — but it never stops the *previous* audio element first. The old `Audio` object is orphaned but still playing.

**Fix:** At the very start of `playAudioBuffer`, stop and clean up any currently playing audio:

```tsx
const playAudioBuffer = useCallback(async (audioBuffer: ArrayBuffer) => {
  // Kill any currently playing audio to prevent overlap
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.onended = null;
    audioRef.current.onerror = null;
    audioRef.current = null;
    setIsPlaying(false);
  }

  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  // ... rest of existing function unchanged
```

---

## Bug 3: Mic does not re-activate after the tutor finishes speaking

After TTS plays, the mic should start recording again automatically in voice mode. It doesn't — the loop just dies.

**Root cause:** The auto-read effect uses `playingMsgId` as a guard to avoid re-reading the same message:

```tsx
if (playingMsgId === lastMsg.id) return;
```

But after playback ends, `setPlayingMsgId(null)` runs, which means `playingMsgId` is no longer equal to `lastMsg.id`, so the effect thinks the message hasn't been read yet and tries to read it AGAIN. This creates an infinite read loop that fights with the mic activation, or at minimum confuses the state.

**Fix:** Replace the `playingMsgId` guard with a Set ref that tracks which messages have already been read aloud:

```tsx
const readMessagesRef = useRef<Set<string>>(new Set());
```

Then rewrite the auto-read effect:

```tsx
useEffect(() => {
  if (!autoRead || !sessionReadyRef.current) return;
  const lastMsg = liveMessages[liveMessages.length - 1];
  if (!lastMsg || lastMsg.role !== "nexi") return;
  if (readMessagesRef.current.has(lastMsg.id)) return;
  readMessagesRef.current.add(lastMsg.id);
  playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead]); // eslint-disable-line react-hooks/exhaustive-deps
```

You can keep `playingMsgId` for the UI (showing which message has a speaker icon) — just don't use it as the guard for whether to trigger auto-read.

---

## Bug 4: `stopAudio` doesn't fully clean up

When exiting voice mode or clicking mute, audio sometimes keeps playing because `stopAudio` doesn't remove event handlers or null the ref.

**Fix:** Update `stopAudio` in `useVoice.ts`:

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

## Bug 5: Entering voice mode while TTS is playing causes feedback loop

If auto-read is playing a message and I click the voice mode button, the mic starts recording while the speaker is still playing. The mic picks up the TTS audio as "my speech" and sends it to STT.

**Fix:** In `toggleVoiceMode`, stop TTS before starting the mic, and use a longer delay:

```tsx
const toggleVoiceMode = useCallback(() => {
  if (voiceMode) {
    setVoiceMode(false);
    stopTTS();
  } else {
    stopTTS(); // Stop any playing audio first
    setVoiceMode(true);
    setAutoRead(true);
    try { localStorage.setItem("arena-auto-read", "true"); } catch {}
    setTimeout(() => voiceStartRecording(), 500); // longer delay to let audio fully stop
  }
}, [voiceMode, setVoiceMode, stopTTS, voiceStartRecording]);
```

---

After all 5 fixes, run `cd apps/web && npx tsc --noEmit` and confirm zero errors.
