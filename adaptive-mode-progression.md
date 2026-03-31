# Adaptive Mode Progression — Claude Code Prompt

> **Context**: Nexus² Mastery Platform. The session mode progression currently advances on a fixed schedule based on exchange count (3 exchanges = teach, 5 = check understanding, 8 = challenge, etc.). This means a learner who demonstrates mastery on the first response still sits through 3 exchanges of teaching. And a learner who's completely lost in the challenge phase never gets re-taught. This prompt makes the progression **adaptive** — it reads the learner's actual answers and decides whether to advance, hold, or drop back.

> **THE RULE: Test this by running actual sessions where the learner gives (1) brilliant answers and verifies the mode advances faster, and (2) confused answers and verifies the mode drops back. Show proof.**

> **TWO-LEVEL ADAPTATION**: The learning system adapts at two levels:
> 1. **Course-level (per exchange)** — The response evaluator decides whether to advance/stay/retreat within the current session based on how the learner handles THIS specific material. A learner who nails RICE scoring skips ahead; one who's confused gets re-taught. This uses Haiku and runs every exchange.
> 2. **User-level (per session)** — The session assessment (already built in `session_assessment.py`) updates the learner's mastery profile (thinking patterns, knowledge graph, pacing preferences) at the end of each session. These insights carry across ALL future courses. If the system learns someone is analytical and needs examples, that applies to every course they take.
>
> The evaluator should READ the user-level profile to inform course-level decisions. If the profile says "learns quickly but struggles with application," advance faster through teach/understand and be more cautious advancing from apply.

---

## The Problem

Two problems with the current approach:

**Problem 1**: Mode progression is fixed by exchange count — a genius and a struggling learner get the exact same pacing.

**Problem 2**: Nexi starts teaching without knowing what the learner already knows. It might spend 3 exchanges explaining RICE scoring to someone who's been using it for years, or dive into advanced stakeholder mapping with someone who's never heard of it.

---

## The Solution: Assess → Teach → Adapt

The session mode order changes from:

```
teach → check_understanding → challenge → apply → reflect
```

To:

```
assess → teach → check_understanding → challenge → apply → reflect
```

A new **assess** mode runs at the very start of every session. It's quick (1-3 exchanges), conversational, and determines the learner's starting level for THIS specific topic.

---

## Step 0: Add the Assess Mode

### Update the SessionMode enum

**File**: `/services/api/app/models/conversation.py`

```python
class SessionMode(str, enum.Enum):
    assess = "assess"
    teach = "teach"
    check_understanding = "check_understanding"
    challenge = "challenge"
    apply = "apply"
    reflect = "reflect"
```

### Update MODE_ORDER everywhere

**File**: `/services/api/app/routers/conversations.py`

```python
MODE_ORDER = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"]
```

### Add assess to SCAFFOLD_PROMPTS

```python
SCAFFOLD_PROMPTS = {
    "assess": {
        "observation": "Nexi is getting to know what you already know about this topic.",
        "consider": [
            "What do you already know about this subject?",
            "Have you had any experience with this in practice?",
        ],
    },
    "teach": { ... },  # existing
    ...
}
```

### Update the Nexi system prompt

**File**: `/services/api/app/services/nexi_engine.py`

Add ASSESS to the SESSION MODES section:

```
- ASSESS: This is the first mode in every session. Your goal is to quickly understand what the learner already knows about this topic. Ask 1-2 casual, open-ended questions — NOT a quiz. Think of it like a coach asking "So, what do you know about [topic]?" and "Have you ever applied this in your work?" Based on their answers, calibrate the depth of your teaching:
  - If they know nothing: teach from the ground up with simple language and lots of examples
  - If they have some familiarity: skip the basics, focus on nuances and common misconceptions
  - If they're already experienced: skip teaching entirely, go straight to challenging scenarios
  Keep it warm and conversational — the learner should feel like they're chatting with a coach, not taking a placement test.
```

### Create an Assessment Evaluator

**File**: `/services/api/app/services/response_evaluator.py`

Add a special function for the assess phase that determines the learner's starting level:

```python
ASSESS_PROMPT = """You are evaluating a learner's existing knowledge about a topic based on their response to an introductory question.

Given the learner's response, determine their familiarity level and return ONLY valid JSON:

{
    "familiarity": "none" | "basic" | "intermediate" | "advanced",
    "skip_to_mode": "teach" | "check_understanding" | "challenge",
    "teach_depth": "foundational" | "intermediate" | "advanced",
    "reason": "one sentence explaining your assessment",
    "learner_insight": "one sentence about what you observed"
}

Rules:
- "none" → skip_to_mode: "teach", teach_depth: "foundational" (start from zero, simple language, lots of examples)
- "basic" → skip_to_mode: "teach", teach_depth: "intermediate" (skip basics, focus on nuances)
- "intermediate" → skip_to_mode: "check_understanding", teach_depth: "advanced" (verify what they know, then challenge)
- "advanced" → skip_to_mode: "challenge", teach_depth: "advanced" (skip teaching, go straight to hard scenarios)

Be generous in your assessment — it's better to start slightly too easy and advance quickly than to overwhelm a learner."""


async def assess_learner_level(
    learner_response: str,
    course_topic: str,
    mastery_profile: dict | None = None,
) -> dict:
    """Assess learner's familiarity with the topic to calibrate teaching depth."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"Course topic: {course_topic}\n"
    if mastery_profile:
        if mastery_profile.get("knowledge_graph"):
            context += f"Known background: {json.dumps(mastery_profile['knowledge_graph'])}\n"

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=ASSESS_PROMPT,
        messages=[{
            "role": "user",
            "content": f"{context}\nLearner said: {learner_response}",
        }],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {
            "familiarity": "none",
            "skip_to_mode": "teach",
            "teach_depth": "foundational",
            "reason": "Could not assess — defaulting to foundational",
        }
```

### Wire assessment into the conversation flow

**File**: `/services/api/app/routers/conversations.py`

In the WebSocket handler, after getting the evaluation, check if we're in assess mode:

```python
from app.services.response_evaluator import evaluate_response, assess_learner_level

# After generating the Nexi response and getting the user's reply:

if session_mode == "assess":
    # Use the special assessment evaluator
    try:
        assessment = await assess_learner_level(
            learner_response=user_content,
            course_topic=course.title if course else "general",
            mastery_profile=profile_dict,
        )
        next_mode = assessment.get("skip_to_mode", "teach")
        teach_depth = assessment.get("teach_depth", "foundational")

        # Store the teach_depth so Nexi knows how deep to go
        # Add it to the conversation metadata
        messages.append({
            "role": "system_meta",  # internal, not sent to Claude
            "_teach_depth": teach_depth,
            "_familiarity": assessment.get("familiarity"),
            "_assessment_reason": assessment.get("reason"),
        })

    except Exception:
        next_mode = "teach"
        teach_depth = "foundational"
else:
    # Use the regular adaptive evaluator for all other modes
    evaluation = await evaluate_response(...)
    next_mode = evaluation.get("next_mode", session_mode)
```

### Pass teach_depth to Nexi

**File**: `/services/api/app/services/nexi_engine.py`

In `_build_messages`, check for a stored `_teach_depth` in the conversation:

```python
# Look for teach_depth in conversation metadata
teach_depth = None
for msg in reversed(conversation_history):
    if msg.get("_teach_depth"):
        teach_depth = msg["_teach_depth"]
        break

if teach_depth:
    system_parts.append(f"\n\nTEACHING CALIBRATION: Based on the initial assessment, this learner's familiarity is {teach_depth}. Adjust your explanations accordingly:")
    if teach_depth == "foundational":
        system_parts.append("- Use simple language, concrete examples, analogies to everyday life")
        system_parts.append("- Don't assume any prior knowledge")
        system_parts.append("- Build up from the very basics")
    elif teach_depth == "intermediate":
        system_parts.append("- Skip basic definitions — they know the basics")
        system_parts.append("- Focus on nuances, common misconceptions, and practical applications")
        system_parts.append("- Use industry-specific examples")
    elif teach_depth == "advanced":
        system_parts.append("- This learner is experienced — don't explain what they already know")
        system_parts.append("- Focus on edge cases, advanced techniques, and challenging scenarios")
        system_parts.append("- Push their thinking from the start")
```

### Update the frontend

**File**: `apps/web/src/app/session/[id]/page.tsx`

Add "assess" to the stages array:

```typescript
const stages: { key: StageKey; label: string }[] = [
  { key: "assess", label: "Getting Started" },
  { key: "teach", label: "Learn" },
  { key: "check_understanding", label: "Understand" },
  { key: "challenge", label: "Think Deeper" },
  { key: "apply", label: "Apply" },
  { key: "reflect", label: "Reflect" },
];
```

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Update initial mode:
```typescript
const [currentMode, setCurrentMode] = useState("assess");
```

### How it should feel to the learner

**Exchange 1** — Nexi: "Hey! Before we dive into strategic decision making, I'm curious — have you worked with any decision frameworks before? Like RICE scoring or opportunity trees? Or is this all new territory?"

**Learner (knows nothing)**: "Not really, I've heard of some frameworks but never used them."
→ Assessment: familiarity=basic, teach_depth=intermediate, skip_to=teach
→ Nexi starts teaching, skipping the very basics but explaining concepts clearly

**Learner (experienced)**: "Yeah, I use RICE daily for sprint planning. I'm more interested in how to handle situations where stakeholders disagree on the scoring."
→ Assessment: familiarity=advanced, teach_depth=advanced, skip_to=challenge
→ Nexi skips teaching entirely: "Great — let me give you a scenario where your VP of Product and VP of Engineering score the same feature completely differently..."

**Learner (total beginner)**: "I have no idea what any of that means"
→ Assessment: familiarity=none, teach_depth=foundational, skip_to=teach
→ Nexi: "No worries at all! Let's start from the beginning. A decision framework is simply a structured way to..."

The assess phase should feel like a casual opening conversation, not a test. One or two exchanges max, then straight into the right level of teaching.

---

## The Previous Problem (still applies)

Current `_determine_mode` in `conversations.py`:

```python
def _determine_mode(messages: list[dict]) -> str:
    exchanges = sum(1 for m in messages if m.get("role") == "user")
    if exchanges <= 3:
        return "teach"
    ...
```

This is purely based on message count. A genius and a struggling learner get the exact same pacing. That's not adaptive learning.

---

## The Solution (Adaptive Progression — applies AFTER the assess phase)

After each exchange, use Claude to do a quick assessment of the learner's most recent response and decide whether to advance the mode, stay in the current mode, or drop back.

### Step 1: Create a Response Evaluator

**File**: Create `/services/api/app/services/response_evaluator.py`

```python
"""Lightweight real-time evaluation of learner responses to determine mode progression."""

import json
import anthropic
from app.core.config import get_settings

settings = get_settings()

EVALUATOR_PROMPT = """You are the real-time assessment engine for Nexus², an adaptive learning platform.

You will be given:
1. The current session mode (teach, check_understanding, challenge, apply, or reflect)
2. Nexi's most recent message (what the AI coach said)
3. The learner's response
4. (Optional) The learner's mastery profile — their known thinking patterns, strengths, and pacing preferences from PREVIOUS courses and sessions. Use this to calibrate your decision.

Evaluate the learner's response and return ONLY valid JSON:

{
    "comprehension": "strong" | "partial" | "weak",
    "reasoning_quality": "strong" | "partial" | "weak",
    "engagement": "high" | "medium" | "low",
    "decision": "advance" | "stay" | "retreat",
    "reason": "one sentence explaining your decision",
    "learner_insight": "one sentence about what you observed about HOW this person thinks (not just what they know)"
}

Decision rules:
- "advance": Learner clearly demonstrates understanding or skill at this level. Move to the next mode.
- "stay": Learner is making progress but not quite ready. Stay in current mode for one more exchange.
- "retreat": Learner is confused or struggling. Drop back to the previous mode to re-teach or re-check.

Be encouraging in your reasoning. A "retreat" isn't failure — it's the system adapting to help the learner.

Use the learner's mastery profile to calibrate:
- If their profile says they learn quickly → be more willing to advance on partial comprehension (they'll catch up)
- If their profile says they struggle with application → be more cautious advancing from APPLY mode
- If their profile says they're analytical → look for structured reasoning in their responses
- If their profile says they prefer examples → they might seem "passive" in teach mode but are actually absorbing
- If no profile is available (new learner), use moderate defaults

The "learner_insight" field is important — this gets accumulated and fed back into the user-level mastery profile at session end. Capture observations like "tends to jump to solutions without considering constraints" or "makes strong analogies between new and familiar concepts" or "needs concrete numbers to feel confident."

Special cases:
- In TEACH mode: advance if learner asks insightful questions or shows they're following. Stay if they're passive. Retreat doesn't apply (already at first mode).
- In CHECK UNDERSTANDING: advance if they can explain the concept correctly. Stay if partially correct. Retreat to teach if fundamentally wrong.
- In CHALLENGE: advance if they handle edge cases well. Stay if they need more practice. Retreat to check_understanding if they've lost the basics.
- In APPLY: advance if they work through the scenario competently. Stay if they need coaching. Retreat to challenge if they can't apply at all.
- In REFLECT: always stay (it's the final mode). If reflection is shallow, prompt deeper."""

MODE_ORDER = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"]


async def evaluate_response(
    current_mode: str,
    nexi_message: str,
    learner_response: str,
    mastery_profile: dict | None = None,
) -> dict:
    """Evaluate learner's response and decide mode progression.

    Returns:
        {
            "comprehension": "strong" | "partial" | "weak",
            "reasoning_quality": "strong" | "partial" | "weak",
            "engagement": "high" | "medium" | "low",
            "decision": "advance" | "stay" | "retreat",
            "reason": str,
            "next_mode": str,
        }
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"Current mode: {current_mode}\n"
    if mastery_profile:
        if mastery_profile.get("thinking_patterns"):
            context += f"Learner profile: {json.dumps(mastery_profile['thinking_patterns'])}\n"

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",  # Use Haiku — this needs to be fast, not deep
        max_tokens=256,
        system=EVALUATOR_PROMPT,
        messages=[{
            "role": "user",
            "content": f"{context}\nNexi said: {nexi_message[-500:]}\n\nLearner responded: {learner_response}",
        }],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    try:
        result = json.loads(text.strip())
    except json.JSONDecodeError:
        # If parsing fails, default to "stay"
        result = {
            "comprehension": "partial",
            "reasoning_quality": "partial",
            "engagement": "medium",
            "decision": "stay",
            "reason": "Could not evaluate — staying in current mode",
        }

    # Calculate next_mode based on decision
    current_index = MODE_ORDER.index(current_mode) if current_mode in MODE_ORDER else 0
    decision = result.get("decision", "stay")

    if decision == "advance" and current_index < len(MODE_ORDER) - 1:
        result["next_mode"] = MODE_ORDER[current_index + 1]
    elif decision == "retreat" and current_index > 0:
        result["next_mode"] = MODE_ORDER[current_index - 1]
    else:
        result["next_mode"] = current_mode

    return result
```

### Step 2: Update the WebSocket Handler to Use Adaptive Progression

**File**: `/services/api/app/routers/conversations.py`

Replace the fixed `_determine_mode` call with the adaptive evaluator. The flow changes from:

**Before**: User sends message → determine mode by exchange count → generate Nexi response

**After**: User sends message → generate Nexi response in current mode → evaluate learner's response → decide next mode for the NEXT exchange

```python
from app.services.response_evaluator import evaluate_response

# At the top of the file, keep _determine_mode as a FALLBACK
# but add a new function:

def _get_current_mode_from_conversation(messages: list[dict]) -> str:
    """Get the current mode from the last scaffold_update stored in messages,
    or fall back to exchange-count-based mode."""
    # Check if there's a stored mode from adaptive evaluation
    for msg in reversed(messages):
        if msg.get("_next_mode"):
            return msg["_next_mode"]
    # Fallback to exchange-count-based
    return _determine_mode(messages)
```

In the WebSocket handler, after streaming the Nexi response and before sending the scaffold update, add the evaluation. **IMPORTANT**: Combine this with the assess-mode logic from Step 0. The full logic should be:

```python
# After full_response is assembled and sent as assistant_complete:

if session_mode == "assess":
    # Step 0: Use assessment evaluator to determine starting level
    try:
        from app.services.response_evaluator import assess_learner_level
        assessment = await assess_learner_level(
            learner_response=user_content,
            course_topic="",  # get from course record
            mastery_profile=profile_dict,
        )
        next_mode = assessment.get("skip_to_mode", "teach")
        evaluation = {"decision": "advance", "reason": assessment.get("reason", "")}
        # Store teach_depth metadata
        messages.append({
            "role": "system_meta",
            "_teach_depth": assessment.get("teach_depth", "foundational"),
            "_familiarity": assessment.get("familiarity"),
        })
    except Exception:
        next_mode = "teach"
        evaluation = {"decision": "advance", "reason": "Assessment unavailable"}
else:
    # Steps 1-5: Use adaptive evaluator for all other modes
    try:
        evaluation = await evaluate_response(
            current_mode=session_mode,
            nexi_message=full_response,
            learner_response=user_content,
            mastery_profile=profile_dict,
        )
        next_mode = evaluation.get("next_mode", session_mode)
    except Exception:
        # If evaluation fails, fall back to fixed progression
        next_mode = _determine_mode(messages)
        evaluation = {"decision": "stay", "reason": "Evaluation unavailable"}

# Send scaffold update with evaluation info
mode_index = MODE_ORDER.index(next_mode) if next_mode in MODE_ORDER else 0
scaffold = SCAFFOLD_PROMPTS.get(session_mode, SCAFFOLD_PROMPTS["teach"])

await websocket.send_json({
    "type": "scaffold_update",
    "mode": session_mode,  # current mode (what just happened)
    "next_mode": next_mode,  # what mode NEXT exchange will be in
    "mode_index": mode_index,
    "observation": scaffold["observation"],
    "consider": scaffold["consider"],
    "evaluation": {
        "comprehension": evaluation.get("comprehension"),
        "reasoning_quality": evaluation.get("reasoning_quality"),
        "decision": evaluation.get("decision"),
        "reason": evaluation.get("reason"),
    },
})

# Store the next_mode in the conversation messages so it persists
messages.append({
    "role": "assistant",
    "content": full_response,
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "_next_mode": next_mode,  # hidden metadata for mode tracking
    "_evaluation": {
        "comprehension": evaluation.get("comprehension"),
        "reasoning_quality": evaluation.get("reasoning_quality"),
        "decision": evaluation.get("decision"),
    },
})
conversation.messages = messages
await db.commit()
```

Then update the mode determination at the TOP of the handler (where it currently calls `_determine_mode`) to read the stored next_mode:

```python
# Replace:
session_mode = _determine_mode(messages)

# With:
session_mode = _get_current_mode_from_conversation(messages)
```

### Step 3: Update the Nexi System Prompt

**File**: `/services/api/app/services/nexi_engine.py`

Add a note to the system prompt so Nexi is aware that mode transitions are adaptive:

Add this to the end of the CORE PRINCIPLES section:

```
- Mode transitions are adaptive. If you're told you're in CHECK UNDERSTANDING mode but the learner clearly already knows this, focus on confirming quickly and flag readiness to advance. If you're in CHALLENGE mode but the learner seems lost, gently scaffold back and re-explain before pushing harder. The system will adjust the mode based on the learner's responses, but you should also adapt your approach within the current mode.
```

### Step 4: Update the Frontend to Show Adaptive Feedback

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Update the scaffold_update handler to capture the evaluation data:

```typescript
interface ScaffoldUpdate {
  mode: string;
  next_mode: string;       // NEW
  mode_index: number;
  observation: string;
  consider: string[];
  evaluation?: {            // NEW
    comprehension: string;
    reasoning_quality: string;
    decision: string;
    reason: string;
  };
}

// In the onmessage handler:
case "scaffold_update":
  setScaffold({
    mode: data.mode,
    next_mode: data.next_mode,    // NEW
    mode_index: data.mode_index,
    observation: data.observation,
    consider: data.consider,
    evaluation: data.evaluation,   // NEW
  });
  setCurrentMode(data.next_mode || data.mode);  // Use next_mode for UI
  break;
```

**File**: `apps/web/src/app/session/[id]/page.tsx`

Show subtle adaptive feedback to the learner. After each Nexi response, if the mode is advancing, show a small encouragement:

```tsx
// After each Nexi message, if the evaluation shows advancement:
{scaffold?.evaluation?.decision === "advance" && (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    className="mx-auto max-w-xs text-center py-2"
  >
    <p className="text-[10px] text-success font-medium">
      Great understanding — let's go deeper
    </p>
  </motion.div>
)}

{scaffold?.evaluation?.decision === "retreat" && (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    className="mx-auto max-w-xs text-center py-2"
  >
    <p className="text-[10px] text-primary font-medium">
      Let me explain that a bit differently
    </p>
  </motion.div>
)}
```

Keep it subtle — the learner shouldn't feel judged. "Advance" = encouragement. "Retreat" = "let me help you" (never "you got it wrong").

### Step 5: Guardrails

The adaptive system needs limits so it doesn't get stuck:

```python
# In response_evaluator.py or conversations.py:

MAX_EXCHANGES_PER_MODE = 5  # Never stay in one mode for more than 5 exchanges
MIN_EXCHANGES_PER_MODE = 1  # Must have at least 1 exchange before advancing

def _apply_guardrails(
    next_mode: str,
    current_mode: str,
    exchanges_in_current_mode: int,
    total_exchanges: int,
) -> str:
    """Apply limits to prevent infinite loops or too-fast progression."""

    # Force advance if stuck too long in one mode
    if exchanges_in_current_mode >= MAX_EXCHANGES_PER_MODE:
        current_index = MODE_ORDER.index(current_mode)
        if current_index < len(MODE_ORDER) - 1:
            return MODE_ORDER[current_index + 1]

    # Don't advance on the very first exchange of a mode
    if exchanges_in_current_mode < MIN_EXCHANGES_PER_MODE:
        return current_mode

    # Force reflect after 15+ total exchanges regardless
    if total_exchanges >= 15:
        return "reflect"

    return next_mode
```

---

## How It Should Feel to the Learner

**Smart learner taking the RICE scoring course:**
- Exchange 1 (teach): Nexi explains RICE scoring
- Exchange 2 (teach): Learner asks "So Impact is subjective — how do you calibrate across team members?"
- *Evaluator sees strong comprehension + insightful question → advance*
- Exchange 3 (check_understanding): Nexi: "Great question. Can you walk me through how you'd score a feature you're currently working on?"
- Exchange 4: Learner gives a solid worked example
- *Evaluator sees strong reasoning → advance*
- Exchange 5 (challenge): Nexi pushes with an edge case
- **Total: 5 exchanges to reach challenge, instead of the fixed 8**

**Struggling learner on the same course:**
- Exchange 1-3 (teach): Nexi explains RICE, learner says "ok" and "makes sense"
- *Evaluator sees low engagement, passive responses → stay in teach*
- Exchange 4 (teach): Nexi gives another example, asks if the learner wants to try
- Exchange 5 (check_understanding): Learner tries to explain but gets Impact and Effort confused
- *Evaluator sees weak comprehension → retreat to teach*
- Exchange 6 (teach): Nexi re-explains the difference between Impact and Effort with a clearer example
- **Total: Still in teach after 6 exchanges, because the learner needs it**

---

## Step 6: Feed Exchange Insights into Session Assessment

The evaluator's `learner_insight` field captures real-time observations about HOW the learner thinks. These should be accumulated during the session and passed to the end-of-session assessment (`session_assessment.py`) so it can update the user-level mastery profile with richer data.

### Store insights in conversation messages

Each exchange already stores `_evaluation` in the message metadata. Add the `learner_insight`:

```python
# In the WebSocket handler, when storing the evaluation:
"_evaluation": {
    "comprehension": evaluation.get("comprehension"),
    "reasoning_quality": evaluation.get("reasoning_quality"),
    "decision": evaluation.get("decision"),
    "learner_insight": evaluation.get("learner_insight"),  # NEW
},
```

### Pass accumulated insights to session assessment

**File**: `/services/api/app/routers/conversations.py` — in the `complete_conversation` endpoint:

```python
# Collect all learner insights from the conversation
learner_insights = []
for msg in (conversation.messages or []):
    eval_data = msg.get("_evaluation", {})
    if eval_data.get("learner_insight"):
        learner_insights.append(eval_data["learner_insight"])

# Pass to the session assessment
assessment = await assess_session(
    conversation.messages or [],
    profile_dict,
    course_metadata,
    learner_insights=learner_insights,  # NEW parameter
)
```

### Update session_assessment.py to use per-exchange insights

**File**: `/services/api/app/services/session_assessment.py`

Add the insights to the assessment prompt context:

```python
async def assess_session(
    conversation_messages: list[dict],
    mastery_profile: dict | None,
    course_metadata: dict | None,
    learner_insights: list[str] | None = None,  # NEW
) -> dict:
    # ... existing code ...

    if learner_insights:
        context_parts.append(
            f"\n\nREAL-TIME OBSERVATIONS (from per-exchange evaluation):\n"
            + "\n".join(f"- {insight}" for insight in learner_insights)
        )
```

This creates a feedback loop:
1. **During session**: Evaluator observes "tends to jump to solutions" (course-level, affects mode progression)
2. **End of session**: Assessment incorporates these observations into the user-level profile update
3. **Next course**: Evaluator reads the updated profile → "this learner tends to jump to solutions" → more cautious about advancing from teach to challenge
4. **Over time**: The mastery profile becomes increasingly accurate about how this specific person learns

---

## Performance Note — Parallel Execution

The evaluator uses **Haiku** (not Sonnet) because it runs on every exchange and needs to be fast.

**CRITICAL: Run the evaluation and TTS in parallel using `asyncio.gather`.**

Here's the execution flow for each exchange:

```
SEQUENTIAL (learner waits for these):
  1. Receive learner message
  2. Load mastery profile + RAG chunks from DB
  3. Stream Nexi response token-by-token → learner sees text in real time
  4. Send assistant_complete

PARALLEL (learner does NOT wait — these run simultaneously):
  ┌─ Evaluate response (Haiku, ~300ms) → determine next mode → send scaffold_update
  └─ Generate TTS audio (ElevenLabs, ~1-2s) → send audio to frontend (teach mode only)

NEXT EXCHANGE: Waits for evaluation result (to know what mode to use).
              Does NOT wait for TTS.
```

**Implementation in the WebSocket handler:**

```python
import asyncio

# After sending assistant_complete:

async def _evaluate():
    """Run Haiku evaluation."""
    if session_mode == "assess":
        return await assess_learner_level(user_content, course_topic, profile_dict)
    else:
        return await evaluate_response(session_mode, full_response, user_content, profile_dict)

async def _generate_tts():
    """Generate TTS audio for teach mode."""
    if session_mode in ("assess", "teach") and full_response:
        try:
            audio_chunks = []
            async for chunk in text_to_speech(full_response[:2000]):
                audio_chunks.append(chunk)
            audio_bytes = b"".join(audio_chunks)
            await websocket.send_json({
                "type": "teach_audio",
                "content": base64.b64encode(audio_bytes).decode("utf-8"),
            })
        except Exception:
            pass  # TTS is best-effort, don't block on failure
    return None

# Run both in parallel
eval_result, _ = await asyncio.gather(_evaluate(), _generate_tts())

# Use eval_result to determine next mode
if session_mode == "assess":
    next_mode = eval_result.get("skip_to_mode", "teach")
else:
    next_mode = eval_result.get("next_mode", session_mode)
```

This means:
- Evaluation (~300ms) and TTS (~1-2s) run at the same time
- The scaffold_update is sent as soon as evaluation finishes (~300ms after assistant_complete)
- TTS audio arrives slightly later — the frontend plays it when it arrives
- If TTS fails, nothing breaks — text is already displayed
- Total added latency to the user experience: **~0ms** (everything happens after they've already seen the text response)

---

## VERIFY

### Assessment tests (Step 0):

1. **Beginner test**: Start a session, respond to the opening question with "I've never heard of this before." Verify Nexi starts teaching at a foundational level — simple language, no jargon, basic examples. The `_teach_depth` should be "foundational."

2. **Expert test**: Start a session, respond with a detailed, knowledgeable answer showing you already understand the topic deeply. Verify the mode skips to challenge or at least check_understanding — Nexi should NOT start teaching basics. Show the `skip_to_mode` value.

3. **Middle ground test**: Start a session, respond with "I've heard of it and used it a bit." Verify Nexi teaches at an intermediate level — skipping definitions, focusing on nuances.

4. **Assessment uses mastery profile**: Start two sessions with the same course — one as a user with a rich mastery profile (seeded data), one as a brand new user. The assessment should calibrate differently based on the existing profile.

### Adaptive progression tests (Steps 1-5):

5. **Fast learner test**: After assessment, give insightful answers that clearly show understanding. Verify that the mode advances faster than the default pace. Show `evaluation.decision: "advance"`.

6. **Struggling learner test**: Give confused or wrong answers. Verify the mode stays or retreats. Show `evaluation.decision: "retreat"`.

7. **Retreat works**: Get past the check_understanding phase, then give a fundamentally wrong answer in challenge. Verify the mode drops back to check_understanding or teach. Verify Nexi's next message re-explains rather than pushing forward.

8. **Guardrails test**: Stay in one mode for 5+ exchanges — verify it force-advances. Send 15+ messages — verify it reaches reflect regardless.

9. **Fallback test**: If the evaluator API call fails, verify it falls back to the fixed exchange-count progression without crashing.

10. **Performance test**: Measure the time between `assistant_complete` and `scaffold_update` — the evaluation should add <1 second of latency.

11. **Frontend test**: Verify the "Getting Started" phase shows during assessment, mode transitions display correctly, and the subtle encouragement/help messages appear.

12. **Feedback loop test**: Complete a full session, then start a new session on a different course. Verify the assessment phase uses insights from the previous session's mastery profile update (e.g., if the first session identified "struggles with application," the second session's evaluator should be more cautious in the apply phase).
