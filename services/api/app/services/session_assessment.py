"""Session assessment — analyzes conversation to update mastery profile."""

import json
import anthropic
from app.core.config import get_settings

settings = get_settings()

ASSESSMENT_PROMPT = """You are the assessment engine for Nexus², an adaptive mastery learning platform.

Analyze the following conversation between a learner and their AI coach (Nexi). Based on how the learner responded throughout the session, provide a structured assessment.

The mastery model uses levels 1-5:
1 = Novice (no understanding)
2 = Developing (basic awareness)
3 = Proficient (can apply with guidance)
4 = Advanced (can apply independently)
5 = Expert (can teach others)

Return ONLY valid JSON with this structure:
{
    "thinking_patterns_update": {
        "reasoning_style": "string — observed reasoning approach",
        "strengths": ["string — specific thinking strengths demonstrated"],
        "gaps": ["string — reasoning gaps observed"]
    },
    "knowledge_graph_update": {
        "demonstrated": ["string — concepts the learner clearly understands"],
        "struggling": ["string — concepts the learner struggled with"],
        "connections_made": ["string — links between concepts the learner made"]
    },
    "capability_assessments": [
        {
            "capability_name": "string",
            "delta": 0.1,
            "reasoning": "string — why this assessment"
        }
    ],
    "session_summary": "string — 2-3 sentence summary of the session",
    "strengths_observed": ["string"],
    "areas_for_improvement": ["string"]
}

Be fair and encouraging. Small positive deltas (+0.1 to +0.3) for good reasoning. Zero or small negative (-0.1) for areas where the learner struggled. Never give large jumps — mastery is built incrementally."""


async def assess_session(
    conversation_messages: list[dict],
    mastery_profile: dict | None,
    course_metadata: dict | None,
    learner_insights: list[str] | None = None,
) -> dict:
    """Analyze a completed session and return structured assessment.

    Args:
        conversation_messages: Full conversation history
        mastery_profile: Current user mastery profile (if any)
        course_metadata: Course title, description, etc.
        learner_insights: Per-exchange insights from the adaptive evaluator,
            collected throughout the session. These provide real-time observations
            about how the learner thinks and communicates.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Build context
    context_parts = [ASSESSMENT_PROMPT]
    if mastery_profile:
        context_parts.append(f"\n\nLEARNER'S CURRENT PROFILE:\n{json.dumps(mastery_profile, indent=2)}")
    if course_metadata:
        context_parts.append(f"\n\nCOURSE CONTEXT:\n{json.dumps(course_metadata, indent=2)}")
    if learner_insights:
        context_parts.append(
            "\n\nREAL-TIME EVALUATOR INSIGHTS (collected during the session):\n"
            + "\n".join(f"- {insight}" for insight in learner_insights if insight)
        )

    # Format conversation
    conv_text = "\n".join(
        f"{'LEARNER' if m.get('role') == 'user' else 'NEXI'}: {m.get('content', '')}"
        for m in conversation_messages
        if m.get('role') in ('user', 'assistant')
    )

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system="".join(context_parts),
        messages=[{"role": "user", "content": f"Assess this session:\n\n{conv_text}"}],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    return json.loads(text.strip())
