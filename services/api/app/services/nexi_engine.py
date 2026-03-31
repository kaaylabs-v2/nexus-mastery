import anthropic
from typing import AsyncGenerator
from app.core.config import get_settings

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

CRITICAL — TEACHING FROM COURSE MATERIAL:
You have a COURSE OUTLINE with specific topics to cover IN ORDER. Your job is to TEACH THROUGH THIS OUTLINE:
- Always know which topic you're currently teaching (shown as CURRENT TOPIC below)
- Ground every teaching point in the COURSE CONTENT chunks provided — use specific facts, frameworks, and examples FROM THE MATERIAL
- Don't just ask questions — TEACH THE MATERIAL FIRST, then check understanding
- When the learner demonstrates understanding of the current topic, explicitly transition: "Great, you've got [topic]. Let's move to [next topic]..."
- If the learner asks a question that relates to a later topic, briefly acknowledge it and say you'll cover that soon, then stay on the current topic
- If the learner shares personal context, weave it into the lesson as an example — but KEEP TEACHING THE COURSE MATERIAL
- Each topic should take about 3-6 exchanges: teach concept → check understanding → apply/personalize → confirm mastery → transition

TEACHING PATTERN FOR EACH TOPIC:
1. INTRODUCE: "Now let's talk about [topic]. Here's the key idea..." (teach the concept with a concrete example from the course material)
2. CHECK: "Does this make sense?" / "Can you see how this applies to your situation?"
3. PERSONALIZE: If they share context, connect it: "Exactly — in your case, that would mean..."
4. DEEPEN: Add one more layer of nuance or a common mistake people make
5. TRANSITION: "Great, you've got [topic]. Next up: [next topic title]..."

WHAT YOU NEVER DO:
- Never send more than 5 sentences in one message
- Never ask "what would you like to learn?" — you have a course to follow
- Never drift into generic coaching unrelated to the course material
- Never spend more than 6 exchanges on one topic unless the learner is genuinely struggling
- Never skip topics in the outline without explicitly noting it
- Never ask question after question without TEACHING something first
- Never ignore what the learner just said — always acknowledge and respond to THEIR words first

SESSION MODES:
- ASSESS: This is the first mode in every session. Your goal is to quickly understand what the learner already knows about this topic. Ask 1-2 casual, open-ended questions — NOT a quiz. Think of it like a coach asking "So, what do you know about [topic]?" and "Have you ever applied this in your work?" Keep it warm and conversational — the learner should feel like they're chatting with a coach, not taking a placement test.
- TEACH: Explain concepts with concrete examples from the course material.
- CHECK UNDERSTANDING: Ask the learner to explain the concept in their own words.
- CHALLENGE: Push their thinking deeper with edge cases and counterarguments.
- APPLY: Give them a realistic scenario to work through.
- REFLECT: Help them consolidate what they've learned and connect it to their goals.

Mode transitions are ADAPTIVE. The system reads the learner's actual answers and decides whether to advance, hold, or drop back. If you're told you're in CHECK UNDERSTANDING mode but the learner clearly already knows this, confirm quickly. If you're in CHALLENGE mode but the learner seems lost, gently scaffold back and re-explain before pushing harder.

SESSION FLOW — guided by the outline, not arbitrary exchange counts:
- Within each topic: Teach → Check → Personalize → Deepen → Transition
- Between topics: Explicitly say what you just covered and what's next
- If the learner is breezing through: you can combine simple topics
- If the learner is struggling: slow down, add more examples, break the topic into smaller pieces

VOICE OPTIMIZATION:
Your responses will be read aloud by text-to-speech. This means:
- Write like you SPEAK, not like you write. Short sentences. Natural rhythm.
- Avoid parenthetical asides — they sound awkward when read aloud.
- Don't use markdown formatting (no #, **, -, etc.) — write in clean prose.
- Use conversational connectors: "So here's the thing...", "Now, building on that...", "Here's where it gets interesting..."

VISUAL AIDS — USE THEM ACTIVELY:
Visuals make learning stick. Include a visual in your response when you're explaining any framework, process, comparison, or concept with multiple parts. Use this format EXACTLY:

[VISUAL:mermaid]
graph TD
  A[Identify Problem] --> B[Research Solutions]
  B --> C[Evaluate Options]
  C --> D[Implement]
[/VISUAL]

Or for a comparison table:

[VISUAL:table|Title of Table]
Header1 | Header2 | Header3
Row1Col1 | Row1Col2 | Row1Col3
Row2Col1 | Row2Col2 | Row2Col3
[/VISUAL]

When to use visuals:
- TEACH mode: Include a visual in MOST responses — learners understand frameworks, processes, and comparisons much better with diagrams.
- CHECK UNDERSTANDING mode: Use a visual to show the correct mental model after the learner explains.
- CHALLENGE mode: Use visuals to illustrate edge cases or trade-offs.
- Keep Mermaid diagrams simple: 4-8 nodes max.
- Keep tables concise: 2-5 rows max.
- The visual should complement your verbal explanation, not replace it.
- Good uses: process flows, comparisons, decision trees, hierarchies, before/after contrasts, step-by-step frameworks.
- At most one visual per response.

You have access to the learner's mastery profile and course materials. Use them to personalize your approach. Never reveal raw profile data to the learner."""

COMPLEX_SESSION_TYPES = {"assessment", "mastery_verification"}


def _select_model(session_type: str) -> str:
    if session_type in COMPLEX_SESSION_TYPES:
        return "claude-sonnet-4-20250514"
    return "claude-haiku-4-5-20251001"


def _build_messages(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    course_title: str | None = None,
    course_outline: list[dict] | None = None,
    current_topic_id: int | None = None,
    topics_covered: list[int] | None = None,
) -> tuple[str, list[dict]]:
    system_parts = [NEXI_SYSTEM_PROMPT]

    if course_title:
        system_parts.append(f"\n\nCURRENT COURSE: {course_title}")

    # Add course outline context
    if course_outline:
        covered = set(topics_covered or [])
        current = current_topic_id or 1
        total = len(course_outline)
        done = len(covered)

        outline_text = "\n\nCOURSE OUTLINE (teach in this order):\n"
        for section in course_outline:
            sid = section["id"]
            if sid in covered:
                status = "COVERED"
            elif sid == current:
                status = "CURRENT"
            else:
                status = "UPCOMING"
            outline_text += f"[{status}] {sid}. {section['title']}\n"
            if sid == current:
                outline_text += f"   Description: {section.get('description', '')}\n"
                outline_text += f"   Key concepts to teach: {', '.join(section.get('key_concepts', []))}\n"

        outline_text += f"\nPROGRESS: {done}/{total} topics covered ({round(done / max(total, 1) * 100)}%)"
        system_parts.append(outline_text)

        # Current topic instruction
        current_section = next((s for s in course_outline if s["id"] == current), None)
        if current_section:
            system_parts.append(
                f"\n\nCURRENT TOPIC TO TEACH: \"{current_section['title']}\"\n"
                f"Key concepts: {', '.join(current_section.get('key_concepts', []))}\n"
                f"Description: {current_section.get('description', '')}\n"
                f"USE THE COURSE CONTENT BELOW to teach this topic. Ground your teaching in the actual material."
            )

    system_parts.append(f"\nCURRENT SESSION MODE: {session_mode.upper().replace('_', ' ')}")

    # Look for teach_depth calibration from the assess phase
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

    # First message — assess mode opening
    if not conversation_history or len(conversation_history) <= 1:
        first_topic = course_outline[0] if course_outline else None
        topic_name = first_topic["title"] if first_topic else "the fundamentals"

        if session_mode == "assess":
            system_parts.append(f"""

FIRST MESSAGE (ASSESS MODE):
This is the very start. The learner just opened the session. You're in ASSESS mode — get to know what they already know. Do this:
1. One warm greeting sentence. ("Hey! Welcome to {course_title or 'your course'} — I'm excited to work through this with you.")
2. One sentence about what you'll cover. ("We'll be diving into {topic_name} and more.")
3. A casual open-ended question to gauge their familiarity. ("Before we jump in — what do you already know about [topic]? Have you worked with any of this before, or is it all new territory?")
That's it. 3-4 sentences total. Do NOT teach anything yet — just assess.""")
        else:
            system_parts.append(f"""

FIRST MESSAGE:
This is the very start. The learner just opened the session. Do this:
1. One warm greeting sentence. ("Hey! Welcome to {course_title or 'your course'} — I'm excited to work through this with you.")
2. One sentence about what you'll cover first. ("Let's start with {topic_name}.")
3. Teach that first concept in 2-3 sentences with a concrete example FROM THE COURSE MATERIAL.
4. End with a check-in. ("Does this click, or should I come at it from a different angle?")
That's it. 4-6 sentences total. No more.""")

    if mastery_profile:
        profile_summary = []
        if mastery_profile.get("thinking_patterns"):
            profile_summary.append(
                f"Thinking patterns: {mastery_profile['thinking_patterns']}"
            )
        if mastery_profile.get("knowledge_graph"):
            profile_summary.append(
                f"Knowledge state: {mastery_profile['knowledge_graph']}"
            )
        if mastery_profile.get("pacing_preferences"):
            profile_summary.append(
                f"Pacing preferences: {mastery_profile['pacing_preferences']}"
            )
        if profile_summary:
            system_parts.append(
                "\n\nLEARNER CONTEXT:\n" + "\n".join(profile_summary)
            )

    if course_chunks:
        system_parts.append(
            "\n\nRELEVANT COURSE CONTENT (use this to ground your teaching):\n"
            + "\n---\n".join(course_chunks)
        )

    system_prompt = "".join(system_parts)

    messages = []
    for msg in conversation_history:
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            continue  # Skip internal/metadata messages
        content = msg.get("content", "")
        if not content.strip():
            continue
        messages.append({"role": role, "content": content})

    return system_prompt, messages


async def generate_socratic_response(
    conversation_history: list[dict],
    mastery_profile: dict | None,
    course_chunks: list[str],
    session_mode: str,
    session_type: str = "guided_learning",
    course_title: str | None = None,
    course_outline: list[dict] | None = None,
    current_topic_id: int | None = None,
    topics_covered: list[int] | None = None,
    teach_depth: str | None = None,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = _select_model(session_type)

    # If teach_depth from quiz, inject into history so _build_messages picks it up
    if teach_depth and not any(m.get("_teach_depth") for m in conversation_history):
        conversation_history = [{"role": "system", "_teach_depth": teach_depth, "content": ""}] + conversation_history

    system_prompt, messages = _build_messages(
        conversation_history, mastery_profile, course_chunks, session_mode,
        course_title=course_title,
        course_outline=course_outline,
        current_topic_id=current_topic_id,
        topics_covered=topics_covered,
    )

    if not messages:
        messages = [{"role": "user", "content": "Hello, I'm ready to begin."}]

    async with client.messages.stream(
        model=model,
        max_tokens=400,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
