# Fix Nexi: The Complete Teaching Experience

> **THIS REPLACES Batch 0c**. This is the most important fix for the entire product. Nexi IS the product — if the teaching experience is broken, nothing else matters.
> **ESTIMATED TIME**: 3-4 hours
> **RULE**: After every fix, open a real browser session, type messages, and verify Nexi responds. Do NOT mark anything done until you've had a 5+ message conversation with Nexi in the browser.

---

## What's Wrong (All of These Must Be Fixed)

### 1. CRITICAL: User messages get NO response after the first
User types "Makes sense" → nothing. "Well?" → nothing. "Can we move on?" → nothing. Nexi is completely unresponsive after her first message. The conversation is dead on arrival.

### 2. Nexi dumps TWO walls of text before the user says anything
The session starts with two massive paragraphs. A real teacher doesn't monologue twice — they say hello, teach one thing, then wait.

### 3. Each message is a textbook dump, not a conversation
Every Nexi message is 5-6 dense paragraphs. A great teacher speaks in 2-3 short, warm sentences at a time.

### 4. No personality or warmth
Nexi reads like a corporate training manual, not like a teacher who cares about you.

### 5. No progression through session phases
User says "makes sense, let's move on" but the session stays stuck in "Learn" mode forever.

---

## PART 1: Fix the WebSocket — Messages Are Being Silently Lost

This is the critical bug. The WebSocket handler in `conversations.py` has THREE problems that cause user messages to disappear.

### Bug A: Missing `flag_modified()` in WebSocket handler

**File**: `services/api/app/routers/conversations.py`

The WebSocket handler updates `conversation.messages` (a JSONB column) but never calls `flag_modified()`. SQLAlchemy doesn't detect JSONB mutations automatically — without `flag_modified`, the changes are never actually written to the database.

Find the section in the WebSocket handler where messages are persisted (after the AI response is generated). It looks something like:

```python
# Persist messages
messages.append({
    "role": "assistant",
    "content": full_response,
    ...
})
conversation.messages = messages
await db.commit()
```

Fix it:
```python
from sqlalchemy.orm.attributes import flag_modified

# Persist messages
messages.append({
    "role": "assistant",
    "content": full_response,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})
conversation.messages = messages
flag_modified(conversation, "messages")  # ← THIS IS THE CRITICAL FIX
await db.commit()
```

Make sure `flag_modified` is imported at the top of the file.

### Bug B: User message not persisted before AI generation

If `generate_socratic_response()` throws an exception, the user's message is never saved. The server sends an error and `continue`s the loop — but the message is gone forever.

Fix: persist the user message BEFORE calling the AI:

```python
# RIGHT AFTER appending the user message to the list:
messages.append({
    "role": "user",
    "content": user_content,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})
conversation.messages = messages
flag_modified(conversation, "messages")
await db.commit()  # ← SAVE USER MESSAGE IMMEDIATELY
await db.refresh(conversation)

# NOW generate the AI response (if this fails, at least the user message is saved)
course_chunks = []
try:
    course_chunks = await retrieve_relevant(...)
except Exception:
    pass

full_response = ""
try:
    async for token in generate_socratic_response(...):
        full_response += token
        await websocket.send_json({"type": "assistant_token", "content": token})
except Exception as e:
    await websocket.send_json({"type": "error", "content": f"Nexi had trouble responding: {str(e)}"})
    continue  # User message is already saved — they can retry

# Now persist the assistant response
messages.append({
    "role": "assistant",
    "content": full_response,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})
conversation.messages = messages
flag_modified(conversation, "messages")
await db.commit()
```

### Bug C: Database session management in the WebSocket loop

Each iteration of the WebSocket loop opens a new `async with async_session() as db:` block. Make sure the conversation is fetched fresh each iteration so you're not working with stale data:

```python
while True:
    raw = await websocket.receive_text()
    message = json.loads(raw)

    if message.get("type") != "user_message":
        continue

    user_content = message.get("content", "").strip()
    if not user_content:
        continue

    # Fresh DB session for each message
    async with async_session() as db:
        # Always fetch the latest conversation state
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            await websocket.send_json({"type": "error", "content": "Conversation not found"})
            continue

        messages = list(conversation.messages or [])
        # ... rest of processing
```

### Bug D: Add logging so you can actually debug

```python
import logging
logger = logging.getLogger(__name__)

# At the start of each message processing:
logger.info(f"WebSocket received message for conversation {conversation_id}: {user_content[:50]}...")

# After AI response:
logger.info(f"Nexi responded with {len(full_response)} chars, mode={session_mode}")

# After persist:
logger.info(f"Messages persisted: {len(messages)} total")

# On errors:
logger.error(f"AI generation failed for conversation {conversation_id}: {e}", exc_info=True)
```

---

## PART 2: Fix the Double Message on Session Start

**File**: `apps/web/src/hooks/useArenaSocket.ts`

The client auto-sends "I'm ready to learn" when the WebSocket opens (in `ws.onopen`). But the server ALSO sends an initial greeting because `_build_messages` generates one when the conversation history is empty. Result: TWO Nexi messages.

Fix: Remove the auto-sent opening message from the client. Let the server handle the first message.

```typescript
// Find in ws.onopen — something like:
ws.send(JSON.stringify({
    type: "user_message",
    content: "I'm ready to learn. Please start teaching me about this topic.",
}));

// REMOVE those lines entirely. Instead, send a lighter "session_start" signal:
ws.send(JSON.stringify({ type: "session_start" }));
```

Then on the server side, handle `session_start` by sending the first teaching message WITHOUT recording it as a user message:

**File**: `services/api/app/routers/conversations.py`

```python
if message.get("type") == "session_start":
    # Generate Nexi's opening message without a user message
    async with async_session() as db:
        conversation = (await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )).scalar_one_or_none()

        if not conversation or conversation.messages:
            continue  # Already has messages — don't re-greet

        course = (await db.execute(
            select(Course).where(Course.id == conversation.course_id)
        )).scalar_one_or_none()

        course_chunks = []
        try:
            rag_query = f"introduction overview {course.title}" if course else "introduction"
            course_chunks = await retrieve_relevant(rag_query, conversation.course_id, db, top_k=5)
        except Exception:
            pass

        if not course_chunks and course:
            course_chunks = [f"Course: {course.title}\nDescription: {course.description or ''}"]

        full_response = ""
        async for token in generate_socratic_response(
            conversation_history=[],
            mastery_profile=None,
            course_chunks=course_chunks,
            session_mode="teach",
            course_title=course.title if course else None,
        ):
            full_response += token
            await websocket.send_json({"type": "assistant_token", "content": token})

        # Save the greeting
        conversation.messages = [{
            "role": "assistant",
            "content": full_response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }]
        flag_modified(conversation, "messages")
        await db.commit()

        await websocket.send_json({
            "type": "assistant_complete",
            "content": full_response,
            "mode": "teach",
        })
    continue

# Existing user_message handling below...
```

---

## PART 3: Fix the System Prompt — Make Nexi a Great Teacher

**File**: `services/api/app/services/nexi_engine.py`

Replace the entire `NEXI_SYSTEM_PROMPT` with this:

```python
NEXI_SYSTEM_PROMPT = """You are Nexi, a warm and brilliant personal tutor. You genuinely care about your learner's growth. Think of yourself as the best teacher they've ever had — patient, encouraging, clear, and conversational.

HOW YOU TEACH:
- Speak naturally, like you're talking to a friend over coffee. Never sound like a textbook.
- Keep every response SHORT: 3-5 sentences maximum. Teach one idea at a time.
- Use concrete, relatable examples. Not abstract theory — real scenarios from their world.
- After teaching one concept, pause and check in: "Make sense?" or "Want me to unpack that more?"
- When the learner says "yes" or "makes sense" — move forward. Don't repeat yourself. Teach the NEXT concept.
- When the learner says "no" or seems confused — slow down, re-explain differently, use a simpler example.
- Be warm. Use their momentum. "Great, you're getting this! Let's build on that..."
- NEVER dump multiple paragraphs at once. One idea, one breath, one check-in.

WHAT YOU NEVER DO:
- Never send more than 5 sentences in one message
- Never ask "what would you like to learn?" — you already know the course material
- Never repeat the same explanation twice — if they didn't get it, try a different angle
- Never give the same response to different messages
- Never ignore what the learner just said — always acknowledge and respond to THEIR words first
- Never use academic jargon without immediately explaining it in plain language

SESSION FLOW:
You guide the learner through a natural progression:

1. TEACH (first few exchanges): Present one concept clearly with an example. Check understanding.
2. UNDERSTAND (after they grasp the basics): Ask them to explain it back, give their own example. Gently correct gaps.
3. THINK DEEPER (once understanding is solid): Push with "what if" questions, edge cases, counterarguments.
4. APPLY (when they're ready): Give a realistic scenario and let them work through it with your coaching.
5. REFLECT (at the end): Help them consolidate what they learned and connect it to the bigger picture.

Move through these naturally based on the learner's responses. Don't announce the phases — just flow.

VOICE OPTIMIZATION:
Your responses will be read aloud by text-to-speech. This means:
- Write like you SPEAK, not like you write. Short sentences. Natural rhythm.
- Avoid parenthetical asides (like this) — they sound awkward when read aloud.
- Don't use markdown formatting (no #, **, -, etc.) — write in clean prose.
- Use conversational connectors: "So here's the thing...", "Now, building on that...", "Here's where it gets interesting..."
"""
```

Also update the first-message instruction:

```python
if not conversation_history or len(conversation_history) <= 1:
    system_parts.append("""

FIRST MESSAGE:
This is the very start. The learner just opened the session. Do this:
1. One warm greeting sentence. ("Hey! Welcome to [course name] — I'm excited to work through this with you.")
2. One sentence about what you'll cover first. ("Let's start with the foundation that everything else builds on: [first concept].")
3. Teach that first concept in 2-3 sentences with a concrete example.
4. End with a check-in. ("Does this click, or should I come at it from a different angle?")

That's it. 4-6 sentences total. No more.""")
```

---

## PART 4: Fix Session Mode Progression

The session mode should advance based on the learner's responses, not stay stuck on "teach" forever.

**File**: `services/api/app/routers/conversations.py`

Find where `session_mode` is determined. It's probably based on exchange count. Update the logic to be smarter:

```python
def _determine_mode(messages: list[dict]) -> str:
    """Determine session mode based on conversation progress."""
    user_messages = [m for m in messages if m.get("role") == "user"]
    exchange_count = len(user_messages)

    # Also look at the CONTENT of the last user message for progression signals
    last_user_msg = user_messages[-1]["content"].lower() if user_messages else ""

    # If learner explicitly asks to move on
    move_on_signals = ["move on", "next", "let's continue", "what's next", "got it", "understood"]
    if any(signal in last_user_msg for signal in move_on_signals):
        # Advance to next phase
        pass  # handled by exchange_count bump below

    if exchange_count <= 2:
        return "teach"
    elif exchange_count <= 4:
        return "check_understanding"
    elif exchange_count <= 7:
        return "challenge"
    elif exchange_count <= 10:
        return "apply"
    return "reflect"
```

Also send the mode update to the client so the UI phase indicator updates:

```python
# After determining the mode, send it:
await websocket.send_json({
    "type": "mode_update",
    "mode": session_mode,
})
```

And on the client side:

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Handle the `mode_update` message type:
```typescript
case "mode_update":
    setCurrentMode(data.mode);
    break;
```

---

## PART 5: Fix Response Length — Enforce Short Messages

**File**: `services/api/app/services/nexi_engine.py`

Reduce `max_tokens` to prevent long responses:

```python
async with client.messages.stream(
    model=model,
    max_tokens=300,  # ← Was 1024. Force shorter responses.
    system=system_prompt,
    messages=messages,
) as stream:
```

300 tokens is about 4-5 sentences — perfect for a conversational teaching style.

---

## PART 6: Load Course Content Properly for First Message

**File**: `services/api/app/routers/conversations.py`

When the session starts, the RAG query uses the user's message (which is empty). Fix this:

```python
# For the first message or session_start, use course metadata as the RAG query:
if len(messages) <= 1:
    course = (await db.execute(
        select(Course).where(Course.id == conversation.course_id)
    )).scalar_one_or_none()
    rag_query = f"introduction overview fundamentals {course.title}" if course else "introduction"
else:
    rag_query = user_content

course_chunks = []
try:
    course_chunks = await retrieve_relevant(rag_query, conversation.course_id, db, top_k=5)
except Exception:
    pass

# Fallback if RAG returns nothing:
if not course_chunks:
    course = course or (await db.execute(
        select(Course).where(Course.id == conversation.course_id)
    )).scalar_one_or_none()
    if course:
        course_chunks = [f"Course: {course.title}\nDescription: {course.description or ''}"]
```

---

## PART 7: Client-Side — Handle Edge Cases

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Make sure the client properly handles all server message types and doesn't get stuck:

```typescript
// Add a timeout — if Nexi hasn't responded in 30 seconds, show an error:
let responseTimeout: ReturnType<typeof setTimeout> | null = null;

// When sending a message:
const sendMessage = (content: string) => {
    // ... existing send logic ...
    setIsStreaming(true);

    // Set a timeout
    responseTimeout = setTimeout(() => {
        setIsStreaming(false);
        // Add an error message to the chat
        setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            role: "nexi",
            content: "Sorry, I'm having trouble responding right now. Could you try sending that again?",
            timestamp: new Date().toLocaleTimeString(),
        }]);
    }, 30000);
};

// When receiving assistant_complete, clear the timeout:
case "assistant_complete":
    if (responseTimeout) clearTimeout(responseTimeout);
    setIsStreaming(false);
    // ... rest of handling
    break;
```

---

## Verification (MANDATORY — DO ALL OF THESE IN A REAL BROWSER)

Open localhost:3000, navigate to a course, start a session.

### Test 1: First message
- Nexi sends ONE short greeting (4-6 sentences max)
- Greeting mentions the course name
- Greeting teaches ONE concept with an example
- Greeting ends with a check-in question
- Voice auto-plays the greeting
- **FAIL if**: Two messages appear, or the message is longer than ~6 sentences

### Test 2: Learner responds
- Type "Makes sense" → Nexi responds within 5 seconds
- Nexi's response acknowledges what you said and moves to the next concept
- Response is short (3-5 sentences)
- **FAIL if**: No response appears, or Nexi repeats the same content

### Test 3: Learner asks a question
- Type "Can you give me another example?" → Nexi gives a different example
- **FAIL if**: Nexi ignores the question or gives the same example

### Test 4: Learner wants to move on
- Type "Got it, what's next?" → Nexi moves to the next concept
- The session phase indicator should advance from "Learn" toward "Understand"
- **FAIL if**: Nexi repeats or stays stuck

### Test 5: Full 10-message conversation
- Have a 10-message back-and-forth conversation
- Every Nexi message should be unique and responsive to what you said
- Session should progress through at least 2-3 phases
- **FAIL if**: Any message gets no response, or conversation feels stuck

### Test 6: Voice
- Voice auto-plays on Nexi's first message
- Click "Voice Off" → next message is silent
- Click "Voice On" → next message plays audio
- **FAIL if**: Voice doesn't play at all, or toggle doesn't work

---

## Done criteria
- [ ] Nexi sends ONE short greeting at session start (not two walls of text)
- [ ] Every user message gets a response (no silent failures)
- [ ] Responses are 3-5 sentences max (conversational, not textbook)
- [ ] Nexi acknowledges what the learner says before teaching
- [ ] Session progresses through phases based on the conversation
- [ ] "Makes sense" / "Got it" / "Next" → Nexi moves forward
- [ ] "I don't understand" / "Huh?" → Nexi re-explains differently
- [ ] Voice auto-plays by default, toggle works
- [ ] 10-message conversation works end-to-end without any message being lost
- [ ] Nexi feels like a warm, brilliant teacher — not a textbook

## DO NOT:
- Say "this should work" — open the browser and have a real conversation
- Fix one part and skip the rest — ALL parts must work together
- Test with curl only — WebSocket bugs only show up in the browser
- Leave any `except Exception: pass` or `except Exception: continue` without logging
