"""Lightweight real-time evaluation of learner responses to determine mode progression.

Two functions:
1. assess_learner_level() — runs during the ASSESS phase at session start
2. evaluate_response() — runs every exchange to decide advance/stay/retreat
"""

import json
import anthropic
from app.core.config import get_settings

settings = get_settings()

MODE_ORDER = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"]

MAX_EXCHANGES_PER_MODE = 6
MIN_EXCHANGES_PER_MODE = 2

# ─── Assessment Prompt (session start) ───

ASSESS_PROMPT = """You are evaluating a learner's existing knowledge about a topic based on their response to an introductory question.

Given the learner's response, determine their familiarity level and return ONLY valid JSON:

{
    "familiarity": "none" | "basic" | "intermediate" | "advanced",
    "skip_to_mode": "teach" | "check_understanding" | "challenge",
    "teach_depth": "foundational" | "intermediate" | "advanced",
    "reason": "one sentence explaining your assessment",
    "learner_insight": "one sentence about how this person learns, written in plain everyday language a non-technical person would understand. Example: 'You pick things up faster when you can connect them to real examples from your own work.' NOT academic jargon like 'demonstrates synthesis opportunities in zero-sum framing.'"
}

Rules:
- "none" → skip_to_mode: "teach", teach_depth: "foundational" (start from zero, simple language, lots of examples)
- "basic" → skip_to_mode: "teach", teach_depth: "intermediate" (skip basics, focus on nuances)
- "intermediate" → skip_to_mode: "check_understanding", teach_depth: "advanced" (verify what they know, then challenge)
- "advanced" → skip_to_mode: "challenge", teach_depth: "advanced" (skip teaching, go straight to hard scenarios)

Be generous in your assessment — it's better to start slightly too easy and advance quickly than to overwhelm a learner."""


# ─── Evaluator Prompt (per-exchange) ───

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
    "learner_insight": "one sentence about how this person learns, written in plain everyday language. Example: 'You tend to understand things better when you can see a real-world example first.' NOT academic language like 'exhibits pattern recognition in cross-domain synthesis.'"
}

Decision rules:
- "advance": Learner clearly demonstrates understanding or skill at this level. Move to the next mode.
- "stay": Learner is making progress but not quite ready. Stay in current mode for one more exchange.
- "retreat": Learner is confused or struggling. Drop back to the previous mode to re-teach or re-check.

Be encouraging in your reasoning. A "retreat" isn't failure — it's the system adapting to help the learner.

Use the learner's mastery profile to calibrate:
- If their profile says they learn quickly → be more willing to advance on partial comprehension
- If their profile says they struggle with application → be more cautious advancing from APPLY mode
- If their profile says they're analytical → look for structured reasoning in their responses
- If their profile says they prefer examples → they might seem "passive" in teach mode but are actually absorbing
- If no profile is available (new learner), use moderate defaults

The "learner_insight" field is important — this gets accumulated and fed back into the user-level mastery profile at session end.

CRITICAL — Passive responses:
- Responses like "yes", "yeah", "got it", "makes sense", "okay", "sure", "mhmm", "I understand" are PASSIVE. They do NOT demonstrate understanding.
- In ANY mode, a passive response should NEVER trigger "advance". At most it should be "stay".
- Only advance when the learner provides SUBSTANTIVE evidence: explains in their own words, answers a specific question correctly, works through a scenario, or asks an insightful question that shows they understood.

Special cases:
- In TEACH mode: advance ONLY if learner gives a substantive response (asks a good question, makes a connection, explains something). Stay if they're passive ("yes", "got it", "makes sense"). Retreat doesn't apply.
- In CHECK UNDERSTANDING: advance ONLY if they can explain the concept in their own words or answer a specific question correctly. Stay if partially correct or passive. Retreat to teach if fundamentally wrong.
- In CHALLENGE: advance if they handle edge cases with correct reasoning. Stay if they need more practice. Retreat to check_understanding if they've lost the basics.
- In APPLY: advance if they work through the scenario with correct steps. Stay if they need coaching. Retreat to challenge if they can't apply at all.
- In REFLECT: always stay (it's the final mode). If reflection is shallow, prompt deeper."""


def _parse_json(text: str) -> dict:
    """Best-effort JSON extraction from Claude response."""
    # Try code-fenced JSON first (most reliable)
    if "```json" in text:
        start = text.find("```json") + len("```json")
        end = text.find("```", start)
        if end != -1:
            return json.loads(text[start:end].strip())
    # Try any code fence
    if "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        if end != -1:
            candidate = text[start:end].strip()
            if candidate.startswith("{"):
                return json.loads(candidate)
    # Fall back to finding raw JSON object
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return json.loads(text[first_brace:last_brace + 1])
    return json.loads(text.strip())


def _apply_guardrails(
    next_mode: str,
    current_mode: str,
    exchanges_in_current_mode: int,
    total_exchanges: int,
) -> str:
    """Apply limits to prevent infinite loops or too-fast progression."""

    # Force advance if stuck too long in one mode
    if exchanges_in_current_mode >= MAX_EXCHANGES_PER_MODE:
        current_index = MODE_ORDER.index(current_mode) if current_mode in MODE_ORDER else 0
        if current_index < len(MODE_ORDER) - 1:
            return MODE_ORDER[current_index + 1]

    # Don't advance on the very first exchange of a mode (except assess → teach)
    if exchanges_in_current_mode < MIN_EXCHANGES_PER_MODE and current_mode != "assess":
        return current_mode

    # Force reflect after 15+ total exchanges regardless
    if total_exchanges >= 15:
        return "reflect"

    return next_mode


async def assess_learner_level(
    learner_response: str,
    course_topic: str,
    mastery_profile: dict | None = None,
) -> dict:
    """Assess learner's familiarity with the topic to calibrate teaching depth.

    Returns:
        {
            "familiarity": "none" | "basic" | "intermediate" | "advanced",
            "skip_to_mode": "teach" | "check_understanding" | "challenge",
            "teach_depth": "foundational" | "intermediate" | "advanced",
            "reason": str,
            "learner_insight": str,
        }
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"Course topic: {course_topic}\n"
    if mastery_profile:
        if mastery_profile.get("knowledge_graph"):
            context += f"Known background: {json.dumps(mastery_profile['knowledge_graph'])}\n"
        if mastery_profile.get("thinking_patterns"):
            context += f"Thinking patterns: {json.dumps(mastery_profile['thinking_patterns'])}\n"

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
    try:
        return _parse_json(text)
    except (json.JSONDecodeError, IndexError):
        return {
            "familiarity": "none",
            "skip_to_mode": "teach",
            "teach_depth": "foundational",
            "reason": "Could not assess — defaulting to foundational",
            "learner_insight": "",
        }


async def evaluate_response(
    current_mode: str,
    nexi_message: str,
    learner_response: str,
    mastery_profile: dict | None = None,
    exchanges_in_current_mode: int = 1,
    total_exchanges: int = 1,
) -> dict:
    """Evaluate learner's response and decide mode progression.

    Returns:
        {
            "comprehension": "strong" | "partial" | "weak",
            "reasoning_quality": "strong" | "partial" | "weak",
            "engagement": "high" | "medium" | "low",
            "decision": "advance" | "stay" | "retreat",
            "reason": str,
            "learner_insight": str,
            "next_mode": str,
        }
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"Current mode: {current_mode}\n"
    if mastery_profile:
        if mastery_profile.get("thinking_patterns"):
            context += f"Learner profile: {json.dumps(mastery_profile['thinking_patterns'])}\n"
        if mastery_profile.get("pacing_preferences"):
            context += f"Pacing: {json.dumps(mastery_profile['pacing_preferences'])}\n"

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",  # Fast, not deep
        max_tokens=256,
        system=EVALUATOR_PROMPT,
        messages=[{
            "role": "user",
            "content": f"{context}\nNexi said: {nexi_message[-500:]}\n\nLearner responded: {learner_response}",
        }],
    )

    text = response.content[0].text
    try:
        result = _parse_json(text)
    except (json.JSONDecodeError, IndexError):
        result = {
            "comprehension": "partial",
            "reasoning_quality": "partial",
            "engagement": "medium",
            "decision": "stay",
            "reason": "Could not evaluate — staying in current mode",
            "learner_insight": "",
        }

    # Calculate raw next_mode from decision
    current_index = MODE_ORDER.index(current_mode) if current_mode in MODE_ORDER else 1
    decision = result.get("decision", "stay")

    if decision == "advance" and current_index < len(MODE_ORDER) - 1:
        raw_next = MODE_ORDER[current_index + 1]
    elif decision == "retreat" and current_index > 1:  # Don't retreat past teach
        raw_next = MODE_ORDER[current_index - 1]
    else:
        raw_next = current_mode

    # Apply guardrails
    result["next_mode"] = _apply_guardrails(
        raw_next, current_mode, exchanges_in_current_mode, total_exchanges
    )

    return result
