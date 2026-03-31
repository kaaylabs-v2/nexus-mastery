# Batch 0c: Fix Nexi Not Teaching — Empty First Messages

> **PRIORITY**: BLOCKING — Nexi asks generic questions instead of teaching from course material. The core product experience is broken.
> **ESTIMATED TIME**: 30-45 minutes
> **DEPENDENCIES**: Batch 0b (courses are published and accessible)

---

## Root Cause

Three things are going wrong:

### Problem 1: No course content on first message

When a session starts, `generate_socratic_response()` is called with an empty message history. Line 113 synthesizes a fake message: `"Hello, I'm ready to begin."` But the RAG retrieval in `conversations.py` line 291 uses `user_content` (the learner's actual message) as the query — which is empty or a generic greeting on the first turn. RAG returns nothing, so Nexi has zero course material in its system prompt and defaults to asking "what would you like to learn?"

### Problem 2: System prompt doesn't tell Nexi to proactively teach

The system prompt says "Teach before you test" but doesn't tell Nexi what to do when a session first starts with no learner input. It needs an explicit instruction: "When a session begins, immediately start teaching the first topic from the course materials."

### Problem 3: The session mode is "learn" but the prompt doesn't give a clear first-lesson instruction

The session starts in "Learn" mode but Nexi treats it as "wait for the learner to tell me what they want" instead of "start teaching the first topic."

---

## Fix 1: Load course content BEFORE the first message

**File**: `services/api/app/routers/conversations.py`

When a session starts (first message or connection), load course content using a broad query instead of the user's empty message.

Find where `retrieve_relevant` is called (around line 289-295) and change it:

```python
# Get relevant course chunks via RAG
course_chunks = []
try:
    # If this is the first message (no history), use the course title/description
    # as the RAG query to get introductory content
    if len(messages) <= 1:
        # Get the course to use its title as a better RAG query
        course_result = await db.execute(
            select(Course).where(Course.id == conversation.course_id)
        )
        course = course_result.scalar_one_or_none()
        rag_query = f"introduction overview fundamentals {course.title if course else ''} {course.description if course else ''}"
    else:
        rag_query = user_content

    course_chunks = await retrieve_relevant(
        rag_query, conversation.course_id, db, top_k=5  # Increase from 3 to 5 for first message
    )
except Exception:
    pass  # RAG is optional
```

Make sure to import the Course model at the top of the file:
```python
from app.models.course import Course
```

---

## Fix 2: Add first-session behavior to the system prompt

**File**: `services/api/app/services/nexi_engine.py`

Add a clear instruction for what Nexi should do when a session begins:

```python
# In _build_messages(), after the IMPORTANT RULES section, add:

if not conversation_history or len(conversation_history) <= 1:
    system_parts.append("""

FIRST MESSAGE INSTRUCTIONS:
This is the start of a new learning session. Do NOT ask the learner what they want to learn — they chose this course, so you already know.
1. Greet them briefly (one sentence).
2. Tell them what you'll be covering today based on the course materials below.
3. Immediately start teaching the first key concept from the course content. Give a clear, concrete explanation with an example.
4. End with a quick comprehension check: "Does this make sense?" or "Want me to go deeper on any part?"

Do NOT ask multiple setup questions. Do NOT say "What would you like to focus on?" — just start teaching.""")
```

---

## Fix 3: Pass course title into the system prompt so Nexi knows what course this is

**File**: `services/api/app/services/nexi_engine.py`

Update `_build_messages` to accept a `course_title` parameter:

```python
def _build_messages(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    course_title: str | None = None,  # ← ADD THIS
) -> tuple[str, list[dict]]:
    system_parts = [NEXI_SYSTEM_PROMPT]

    # Add course context
    if course_title:
        system_parts.append(f"\n\nCURRENT COURSE: {course_title}")

    system_parts.append(f"\nCURRENT SESSION MODE: {session_mode.upper().replace('_', ' ')}")
    # ... rest of function
```

**File**: `services/api/app/routers/conversations.py`

Pass the course title when calling `generate_socratic_response`:

```python
# Before the generate_socratic_response call, get the course:
course_result = await db.execute(
    select(Course).where(Course.id == conversation.course_id)
)
course = course_result.scalar_one_or_none()

# Update the generate_socratic_response call:
async for token in generate_socratic_response(
    conversation_history=messages,
    mastery_profile=profile_dict,
    course_chunks=course_chunks,
    session_mode=session_mode,
    session_type=conversation.session_type or "guided_learning",
    course_title=course.title if course else None,  # ← ADD THIS
):
```

Also update `generate_socratic_response` to accept and pass through `course_title`:

```python
async def generate_socratic_response(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    session_type: str = "guided_learning",
    course_title: str | None = None,  # ← ADD THIS
) -> AsyncGenerator[str, None]:
    # ...
    system_prompt, messages = _build_messages(
        conversation_history, mastery_profile, course_chunks, session_mode,
        course_title=course_title,  # ← PASS IT THROUGH
    )
```

---

## Fix 4: Handle the case where RAG returns no content

Even with a better query, RAG might return nothing (e.g., embeddings weren't generated). Add a fallback that uses the course description:

**File**: `services/api/app/routers/conversations.py`

```python
# After the RAG retrieval, if no chunks were found, use course metadata as context:
if not course_chunks and course:
    course_chunks = [
        f"Course: {course.title}\n"
        f"Description: {course.description or 'No description'}\n"
        f"Type: {course.course_type or 'General'}"
    ]
```

---

## Fix 5: Voice should auto-play on ALL Nexi messages, not just "teach" mode

The auto-read TTS is already implemented but it's gated to only work in "teach" mode. Nexi is a teacher — her voice should be the default experience in every mode, with a clear toggle to turn it off.

**File**: `apps/web/src/app/session/[id]/page.tsx`

Find the auto-read useEffect (around line 136-144):

```typescript
// CURRENT (broken — only reads in teach mode):
useEffect(() => {
    if (!autoRead) return;
    const lastMsg = liveMessages[liveMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "nexi") return;
    if (currentMode !== "teach") return;  // ← REMOVE THIS LINE
    if (playingMsgId === lastMsg.id) return;
    playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead, currentMode]);

// FIXED (reads in all modes):
useEffect(() => {
    if (!autoRead) return;
    const lastMsg = liveMessages[liveMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "nexi") return;
    if (playingMsgId === lastMsg.id) return;
    playTTS(lastMsg.id, lastMsg.content);
}, [liveMessages, autoRead]);
```

The key change: remove `if (currentMode !== "teach") return;` — Nexi should read aloud in every mode.

---

## Fix 6: Use a warm, soothing ElevenLabs voice

The current voice ID `21m00Tcm4TlvDq8ikWAM` is "Rachel" — clear but a bit clinical. For a warm, buttery teaching voice, switch to a better option.

**File**: `services/api/app/services/voice_service.py`

Also tune the voice settings for warmth:

```python
# Update the voice settings for a warmer, more soothing delivery:
json={
    "text": text,
    "model_id": "eleven_turbo_v2_5",  # Faster, more natural model
    "voice_settings": {
        "stability": 0.6,        # Slightly more stable for teaching clarity
        "similarity_boost": 0.8,  # Keep it natural
        "style": 0.3,            # Slight expressiveness
        "use_speaker_boost": True,
    },
},
```

To find the best voice: go to https://elevenlabs.io/voice-library and search for warm, soothing voices. Good options for a teaching voice:
- "Aria" (warm, professional female)
- "Sarah" (calm, clear female)
- "Charlie" (warm, friendly male)

Once you pick one, update the ELEVENLABS_VOICE_ID in your backend `.env` file:
```bash
# In services/api/.env:
ELEVENLABS_VOICE_ID=<new-voice-id-from-elevenlabs>
```

---

## Fix 7: Make the voice toggle more prominent

The current toggle is a tiny icon in the stage bar. Make it clearer that voice is on by default and can be turned off.

**File**: `apps/web/src/app/session/[id]/page.tsx`

Find the toggle button (around line 289-292) and make it more visible:

```tsx
<button onClick={toggleAutoRead}
  title={autoRead ? "Voice is on — click to mute" : "Voice is off — click to unmute"}
  className={cn(
    "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors",
    autoRead
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground hover:text-foreground"
  )}>
  {autoRead ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
  {autoRead ? "Voice On" : "Voice Off"}
</button>
```

---

## Verification (MANDATORY)

```bash
# 1. Start a new session and check that Nexi teaches immediately:
#    Open localhost:3000, go to a course, start a session.
#    Nexi's FIRST message must:
#    - Reference the actual course name
#    - Start teaching a specific concept from the course material
#    - NOT ask "What would you like to learn?"
#    - NOT ask "What topic should we focus on?"
#    - Auto-play as voice (you should HEAR Nexi teaching)

# 2. The voice toggle should show "Voice On" by default — clearly visible

# 3. Click "Voice Off" — next Nexi message should NOT auto-play audio

# 4. Click "Voice On" again — next Nexi message SHOULD auto-play audio

# 5. Send a follow-up message like "tell me more" — Nexi should continue
#    teaching with deeper content AND read it aloud

# 6. Progress to "Understand" mode — Nexi should STILL read aloud
#    (not just in teach mode)

# 7. Start a session on a DIFFERENT course — Nexi should teach different
#    content based on that course's materials, and read it aloud
```

## Done criteria
- Nexi's first message teaches from the course material immediately
- No generic "what do you want to learn?" questions at session start
- Course title is mentioned in the first message
- Voice auto-plays on EVERY Nexi message by default (not just teach mode)
- Voice toggle is clearly visible and labeled "Voice On" / "Voice Off"
- Clicking "Voice Off" stops auto-play; clicking "Voice On" resumes it
- Follow-up messages go deeper into the material
- Works for all courses, not just one
