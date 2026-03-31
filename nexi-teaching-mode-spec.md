# Nexi Teaching Mode — Claude Code Prompt

> **Context**: This is a focused update to the Nexi AI engine in the Nexus² Mastery Platform. The current implementation jumps straight into Socratic questioning — it never actually teaches. A learner who doesn't know the material yet gets peppered with questions they can't answer. This update adds a **teaching phase** before the questioning phases, so Nexi first explains the concept using the uploaded course materials, then coaches through questions to deepen understanding.

---

## What Exists Today

### System Prompt (`/services/api/app/services/nexi_engine.py`)
The current `SOCRATIC_SYSTEM_PROMPT` says "NEVER give direct answers. Always guide through questions." This is too rigid — it means Nexi can't teach at all.

### Session Modes (`/services/api/app/models/conversation.py`)
```python
class SessionMode(str, enum.Enum):
    clarify = "clarify"
    challenge = "challenge"
    show_your_work = "show_your_work"
    alternatives = "alternatives"
    learn_from_it = "learn_from_it"
```

### Mode Progression (`/services/api/app/routers/conversations.py`, line 22)
```python
def _determine_mode(messages: list[dict]) -> str:
    exchanges = sum(1 for m in messages if m.get("role") == "user")
    if exchanges <= 3:
        return "clarify"
    elif exchanges <= 6:
        return "challenge"
    elif exchanges <= 9:
        return "show_your_work"
    elif exchanges <= 11:
        return "alternatives"
    return "learn_from_it"
```

### Scaffold Update (conversations.py, line 211)
Currently sends generic prompts like "Pay attention to how you're approaching this in the clarify phase."

### Frontend Labels (`apps/web/src/app/session/[id]/page.tsx`)
The session page shows 5 stages with labels and colors mapped to the old mode names.

---

## The Change

### New Session Modes

Replace the 5 questioning-only modes with 5 modes that include teaching:

```python
class SessionMode(str, enum.Enum):
    teach = "teach"
    check_understanding = "check_understanding"
    challenge = "challenge"
    apply = "apply"
    reflect = "reflect"
```

**teach** — Nexi explains the concept clearly using the RAG course content. Structured, concise, with examples. Tailored to the learner's level from their mastery profile. Nexi CAN and SHOULD give direct information here. Think of a great teacher opening a lesson — not lecturing for 20 minutes, but giving a clear 2-3 paragraph explanation with a concrete example, then checking if the learner is following.

**check_understanding** — Nexi asks the learner to explain what they just learned in their own words. "In your own words, what would you say is the key idea here?" or "Can you give me an example of how this applies?" Simple comprehension check — not gotcha questions.

**challenge** — Now the Socratic questioning kicks in. Nexi pushes back, introduces edge cases, asks "What about a situation where...?" and "What would someone who disagrees say?" This is where the original Socratic approach shines — but only after the learner has a foundation to reason from.

**apply** — Nexi presents a realistic scenario and asks the learner to work through it. "Here's a situation: [scenario]. Walk me through how you'd handle this." This is where learning locks in — applying knowledge to a concrete problem.

**reflect** — Nexi asks what the learner took away. "What's the most important thing you learned?" "What would you do differently next time?" Wraps up the session and reinforces key insights.

---

## Files to Change

### 1. Update SessionMode enum
**File**: `/services/api/app/models/conversation.py`

```python
class SessionMode(str, enum.Enum):
    teach = "teach"
    check_understanding = "check_understanding"
    challenge = "challenge"
    apply = "apply"
    reflect = "reflect"
```

**Migration note**: If there are existing conversations in the DB with old mode values, add a migration that maps: `clarify` → `teach`, `challenge` → `challenge`, `show_your_work` → `check_understanding`, `alternatives` → `apply`, `learn_from_it` → `reflect`. If the DB is empty (dev only), just update the enum.

### 2. Rewrite the System Prompt
**File**: `/services/api/app/services/nexi_engine.py`

Replace `SOCRATIC_SYSTEM_PROMPT` with:

```python
NEXI_SYSTEM_PROMPT = """You are Nexi, an adaptive mastery coach. Your role is to help learners deeply understand and apply concepts — first by teaching clearly, then by coaching through questions.

CORE PRINCIPLES:
- Teach before you test. Make sure the learner has a solid foundation before asking them to reason.
- When teaching, be clear, concise, and concrete. Use examples from the course materials. Don't lecture — explain in 2-3 focused paragraphs, then check understanding.
- When coaching, use Socratic questioning: "What makes you think that?", "What assumptions are you making?", "What would happen if...?"
- Ask one question at a time. Don't overwhelm.
- Adapt to the learner's level. If their mastery profile shows they already understand something, skip the teaching and go straight to deeper questions. If they're struggling, slow down and re-explain.
- If the learner is stuck during questioning, don't just repeat the question — scaffold down. Give a hint, reframe the problem, or briefly re-teach the concept they're missing.
- Celebrate reasoning progress and effort, not just correct answers.
- Connect current topics to concepts from previous sessions when relevant.
- Be warm, encouraging, and human. You're a coach who genuinely cares about this person's growth.

SESSION MODES (follow the current mode's approach):

- TEACH: Present the concept clearly using the course materials. Give a concise explanation with a concrete example. Make it accessible for the learner's current level. End by checking if they're following: "Does this make sense so far?" or "Any part of this you'd like me to clarify?"

- CHECK UNDERSTANDING: Ask the learner to explain what they just learned in their own words. "Can you summarize the key idea?" or "Give me an example of how this applies." Listen for gaps — if they misunderstood something, gently correct and re-explain that part before moving on.

- CHALLENGE: Now push their thinking. Introduce edge cases, counterarguments, and nuance. "What would happen if the situation were different?" "What would someone who disagrees say?" "Are there exceptions to this?" This is where the Socratic method shines — but only because the learner now has a foundation to reason from.

- APPLY: Present a realistic scenario relevant to the learner's role and ask them to work through it. "Here's a situation: [scenario]. How would you approach this?" Let them reason through it. Coach them with follow-up questions if they get stuck, but let them do the thinking.

- REFLECT: Help the learner consolidate what they learned. "What's the most important takeaway for you?" "What would you do differently next time?" "How does this connect to what we discussed before?" Reinforce key insights and celebrate progress.

You have access to the learner's mastery profile and course materials. Use them to personalize your approach — adjust complexity, skip what they already know, focus on their gaps. Never reveal raw profile data to the learner."""
```

Also update the reference from `SOCRATIC_SYSTEM_PROMPT` to `NEXI_SYSTEM_PROMPT` in `_build_messages()`.

### 3. Update Mode Progression Logic
**File**: `/services/api/app/routers/conversations.py`

Replace `_determine_mode`:

```python
def _determine_mode(messages: list[dict]) -> str:
    """Progress through session modes based on exchange count.

    Flow: teach (first 2-3 exchanges) → check_understanding (next 2) →
          challenge (next 3) → apply (next 3) → reflect (final)
    """
    exchanges = sum(1 for m in messages if m.get("role") == "user")
    if exchanges <= 3:
        return "teach"
    elif exchanges <= 5:
        return "check_understanding"
    elif exchanges <= 8:
        return "challenge"
    elif exchanges <= 11:
        return "apply"
    return "reflect"
```

### 4. Update Scaffold Messages
**File**: `/services/api/app/routers/conversations.py`, around line 211

Replace the generic scaffold with mode-specific coaching prompts:

```python
SCAFFOLD_PROMPTS = {
    "teach": {
        "observation": "Nexi is explaining the concept. Follow along and ask questions if anything is unclear.",
        "consider": [
            "What's the key idea being explained?",
            "How does this connect to what you already know?",
        ],
    },
    "check_understanding": {
        "observation": "Time to check your understanding. Try to explain the concept in your own words.",
        "consider": [
            "Can you summarize the main point?",
            "What's a real-world example of this?",
        ],
    },
    "challenge": {
        "observation": "Nexi is pushing your thinking deeper. Consider edge cases and counterarguments.",
        "consider": [
            "What assumptions are you making?",
            "What would happen if the situation were different?",
        ],
    },
    "apply": {
        "observation": "Time to apply what you've learned to a realistic scenario.",
        "consider": [
            "What's your first instinct? Why?",
            "What information do you need to make a good decision?",
        ],
    },
    "reflect": {
        "observation": "Reflect on what you've learned. What will you take away from this session?",
        "consider": [
            "What's the most important thing you learned?",
            "What would you do differently next time?",
        ],
    },
}
```

Then in the WebSocket handler, replace the hardcoded scaffold with:
```python
scaffold = SCAFFOLD_PROMPTS.get(session_mode, SCAFFOLD_PROMPTS["teach"])
await websocket.send_json({
    "type": "scaffold_update",
    "mode": session_mode,
    "mode_index": mode_index,
    "observation": scaffold["observation"],
    "consider": scaffold["consider"],
})
```

### 5. Update Frontend Stage Labels
**File**: `apps/web/src/app/session/[id]/page.tsx`

Update the stages array and the `stageInsights` object to use the new mode names. The user-facing labels should be plain language (these will also be updated via Lovable later, but set sensible defaults now):

```typescript
const stages = [
  { key: "teach", label: "Learn", color: "primary" },
  { key: "check_understanding", label: "Understand", color: "warning" },
  { key: "challenge", label: "Think Deeper", color: "info" },
  { key: "apply", label: "Apply", color: "purple" },
  { key: "reflect", label: "Reflect", color: "success" },
];
```

### 6. Update Frontend Hook
**File**: `apps/web/src/hooks/useArenaSocket.ts`

The `currentMode` state initializes to `"clarify"`. Change it to `"teach"`:
```typescript
const [currentMode, setCurrentMode] = useState("teach");
```

---

## Task 7: Auto-Narrate Teaching Messages (Voice TTS)

During the **teach** phase, Nexi's messages should be automatically read aloud using the existing ElevenLabs TTS pipeline (`voice_service.py` → `text_to_speech()`). This makes the learning experience feel like having a real coach explain something to you, not reading a textbook.

### Backend: Add a TTS REST endpoint
**File**: `/services/api/app/routers/voice.py`

Add a new HTTP endpoint (not WebSocket) that converts text to speech on demand:

```python
@router.post("/tts")
async def text_to_speech_endpoint(
    request: TTSRequest,
    user: User = Depends(get_current_user),
):
    """Convert text to speech. Used by the frontend to narrate teaching messages."""
    audio_chunks = []
    async for chunk in text_to_speech(request.text):
        audio_chunks.append(chunk)

    audio_bytes = b"".join(audio_chunks)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline"},
    )
```

Add schema:
```python
class TTSRequest(BaseModel):
    text: str  # max ~2000 chars to keep audio reasonable
```

This is simpler than routing everything through the voice WebSocket — the frontend just POSTs the teaching message text and gets audio bytes back.

### Frontend: Auto-play in teach mode + toggle
**File**: `apps/web/src/hooks/useArenaSocket.ts` and `apps/web/src/app/session/[id]/page.tsx`

When a message arrives with `scaffold_update.mode === "teach"`:
1. Call `POST /api/voice/tts` with the `assistant_complete` content
2. Play the returned audio using the `useVoice` hook's `playAudio()` (already supports base64 audio playback)
3. Show a small speaker animation on the teaching message card while audio plays

Add a **preference toggle**: "Auto-read lessons" — stored in localStorage. On by default. When off, teaching messages display normally without audio. Show the toggle as a small speaker icon at the top of the chat area.

For **non-teach phases** (check_understanding, challenge, apply, reflect): voice is off by default, but add a small "Listen" button (speaker icon) on any Nexi message that lets the learner tap to hear it read aloud on demand.

---

## What NOT to Change

- **Model routing** (`_select_model`): Keep Sonnet for assessment/mastery_verification, Haiku for guided_learning/practice. The teaching mode doesn't affect which model is used.
- **Context injection** (`_build_messages`): Keep injecting mastery profile + RAG chunks + conversation history exactly as-is. The teaching mode USES the course chunks to explain concepts — that's the whole point.
- **SessionType enum**: Keep assessment, guided_learning, practice, mastery_verification. These are session-level types. The modes (teach → reflect) are the phase within a session.
- **Voice service**: Don't touch `voice.py` here — that's a separate fix in Phase 4 Task 0c.

---

## Testing

After making changes, verify:

1. Start a new conversation. The first response from Nexi should **explain something** from the course content, not ask a question. It should feel like a teacher opening a lesson.
2. After 3 exchanges, Nexi should shift to asking the learner to explain in their own words.
3. After 5 exchanges, Nexi should start challenging with deeper questions and edge cases.
4. After 8 exchanges, Nexi should present a scenario for the learner to work through.
5. After 11 exchanges, Nexi should ask reflective questions.
6. The scaffold_update messages should match the current mode.
7. The frontend should show updated stage labels.

---

## Priority

Do this BEFORE Phase 4. It's a focused change to 4-5 files and takes ~30 minutes. Everything downstream (the Lovable UX prompts, the admin course design, the session experience) depends on the AI actually teaching before questioning.
