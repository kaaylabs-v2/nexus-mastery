# Fix Duplicate & Canned Nexi Responses — Claude Code Prompt

> **THE RULE: Run the fix, start a session, send 5+ messages, and verify each Nexi response is unique and contextually appropriate. Screenshot every exchange. If any response is duplicated or ignores what the learner said, it's not fixed.**

---

## The Problem

Two bugs visible in the session:

1. **Nexi gives the exact same response twice**: "That's an interesting perspective. Let me challenge that assumption — what evidence do you have that supports this approach?" appears verbatim for two completely different learner messages.

2. **Nexi ignores the learner's actual request**: The learner asked "Teach me about BATNA in negotiations" and "Can you give me an example of how to strengthen my BATNA?" — both are explicit learning requests. But Nexi responds with a generic challenge-mode question instead of teaching about BATNA.

---

## Root Cause Investigation

**First, add logging to understand what's happening.** Before fixing anything, add temporary debug logging so we can see exactly what Claude is receiving:

**File**: `/services/api/app/services/nexi_engine.py`

```python
import logging
logger = logging.getLogger(__name__)

async def generate_socratic_response(...):
    ...
    system_prompt, messages = _build_messages(...)

    # DEBUG: Log what we're sending to Claude
    logger.info(f"=== NEXI REQUEST ===")
    logger.info(f"Model: {model}")
    logger.info(f"Session mode: {session_mode}")
    logger.info(f"System prompt length: {len(system_prompt)}")
    logger.info(f"Messages count: {len(messages)}")
    for i, msg in enumerate(messages):
        logger.info(f"  [{i}] {msg['role']}: {msg['content'][:100]}...")
    logger.info(f"Course chunks: {len(course_chunks)} chunks")
    logger.info(f"=== END REQUEST ===")
    ...
```

**File**: `/services/api/app/routers/conversations.py`

```python
import logging
logger = logging.getLogger(__name__)

# In the WebSocket handler, after loading conversation:
logger.info(f"Conversation {conversation_id}: {len(messages)} messages, mode={session_mode}")
logger.info(f"User said: {user_content[:100]}")
```

**Run the server, start a session, send 3 messages, and read the logs.** Look for:
- Are all previous messages present in the history? (If not, conversation isn't persisting)
- Is the session_mode correct? (If it's "challenge" when it should be "teach", mode logic is wrong)
- Are there duplicate or corrupted messages in the history?
- Are the course_chunks present? (If empty, RAG isn't working for this course)

---

## Likely Fix 1: Conversation messages not persisting correctly

SQLAlchemy JSONB columns sometimes don't detect mutations. The current code does:
```python
messages = list(conversation.messages or [])  # creates new list
messages.append(...)                           # adds to new list
conversation.messages = messages               # reassigns
await db.commit()                              # should persist
```

This SHOULD work because we're reassigning. But to be safe, force SQLAlchemy to detect the change:

```python
from sqlalchemy.orm.attributes import flag_modified

# After updating messages:
conversation.messages = messages
flag_modified(conversation, "messages")
await db.commit()
```

Add `flag_modified` in TWO places:
1. After appending the user message (before generating the response) — currently this doesn't commit, but it should so the user message is persisted even if the AI call fails
2. After appending the assistant message (line 341)

```python
# After appending user message (around line 267-272):
messages = list(conversation.messages or [])
messages.append({
    "role": "user",
    "content": user_content,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})
conversation.messages = messages
flag_modified(conversation, "messages")
await db.flush()  # Persist user message immediately

# ... generate response ...

# After appending assistant message (around line 335-342):
messages.append({
    "role": "assistant",
    "content": full_response,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})
conversation.messages = messages
flag_modified(conversation, "messages")
await db.commit()
```

## Likely Fix 2: _build_messages corrupting history with internal messages

The `_build_messages` function converts ANY role that isn't "user" or "assistant" to "user":

```python
if role not in ("user", "assistant"):
    role = "user"
```

If there are internal metadata messages stored in the conversation (like `{"role": "system_meta", "_teach_depth": "foundational"}`), they get converted to user messages with garbage content. This confuses Claude.

**Fix**: Filter out non-user/assistant messages entirely:

```python
def _build_messages(...):
    ...
    messages = []
    for msg in conversation_history:
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            continue  # Skip internal messages — don't convert them to user
        content = msg.get("content", "")
        if not content.strip():
            continue  # Skip empty messages
        messages.append({"role": role, "content": content})
    return system_prompt, messages
```

## Likely Fix 3: Nexi not adapting to what the learner asks

Even in challenge mode, if a learner explicitly asks "teach me about X", Nexi should recognize that and adapt. The system prompt already says "If the learner is stuck during questioning, don't just repeat the question — scaffold down."

But the current mode injection just says `CURRENT SESSION MODE: CHALLENGE`. Add an instruction that overrides mode when the learner explicitly asks to learn:

**File**: `/services/api/app/services/nexi_engine.py`

In `_build_messages`, add after the mode line:

```python
system_parts.append(f"\n\nCURRENT SESSION MODE: {session_mode.upper().replace('_', ' ')}")

# Add this:
system_parts.append("""

IMPORTANT: If the learner explicitly asks you to teach, explain, or give an example (e.g., "teach me about X", "what is X?", "can you explain X?", "give me an example of X"), ALWAYS respond by teaching — regardless of what mode you're in. The learner's explicit request to learn takes priority over the session mode. After teaching what they asked, you can return to the current mode's approach.""")
```

## Likely Fix 4: Identical responses (caching or empty history)

If Claude receives the exact same system prompt + messages twice, it may generate the same response. This happens if:
- The conversation history isn't including the previous exchanges (messages lost)
- The history has the exact same last message (duplicate send)

**Check**: After the fix, verify that each `generate_socratic_response` call receives a DIFFERENT message history (progressively longer with each exchange). The debug logging from above will show this.

---

## VERIFY

After applying all fixes:

```bash
# Start the server with DEBUG logging
cd services/api
LOG_LEVEL=DEBUG uvicorn app.main:app --reload --port 8000 2>&1 | tee session_debug.log &
```

1. Start a session on any course
2. Send: "What is this course about?"
3. **VERIFY**: Nexi teaches/explains (not just asks a question)
4. Send: "That makes sense, tell me more"
5. **VERIFY**: Nexi continues teaching with NEW content (not the same response)
6. Send: "I don't understand, can you explain it differently?"
7. **VERIFY**: Nexi re-explains in a different way (not the same challenge question)
8. Send: "Teach me about BATNA"
9. **VERIFY**: Nexi actually teaches about BATNA (regardless of current mode)
10. Check `session_debug.log` — verify each call to Claude has progressively more messages in the history

**Screenshot every exchange. No two Nexi responses should be identical.**
