"""Quiz generator — creates placement quizzes from course content using Haiku."""

import json
import anthropic
from app.core.config import get_settings

settings = get_settings()

QUIZ_PROMPT = """You are the assessment engine for Nexus², an adaptive mastery learning platform.

Generate a quick placement quiz to gauge a learner's familiarity with a course BEFORE they start learning. The quiz should:

1. Start easy and ramp up in difficulty
2. Cover the breadth of the course material
3. Use a mix of question types:
   - "multiple_choice" (4 options, 1 correct)
   - "true_false"
   - "scenario" (short scenario + 3-4 options, tests applied understanding)
4. Be conversational and approachable — not exam-like
5. Each question should have a "difficulty" (1=basic, 2=intermediate, 3=advanced)

Return ONLY valid JSON with this structure:
{
    "quiz_title": "string — friendly title like 'Quick Check: How much do you know about X?'",
    "questions": [
        {
            "id": 1,
            "type": "multiple_choice | true_false | scenario",
            "difficulty": 1,
            "question": "string — the question text",
            "context": "string | null — optional scenario or context paragraph",
            "options": [
                {"id": "a", "text": "string"},
                {"id": "b", "text": "string"},
                {"id": "c", "text": "string"},
                {"id": "d", "text": "string"}
            ],
            "correct_answer": "a",
            "explanation": "string — brief explanation of why this is correct"
        }
    ]
}

Generate exactly 8 questions: 3 basic (difficulty 1), 3 intermediate (difficulty 2), 2 advanced (difficulty 3).
For true_false questions, use only options "a" (True) and "b" (False).
"""


async def generate_quiz(
    course_title: str,
    course_description: str | None = None,
    topics: list[str] | None = None,
    course_outline: list[dict] | None = None,
) -> dict:
    """Generate a placement quiz for a course using Haiku for speed."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Build context from available course data
    context_parts = [f"COURSE: {course_title}"]
    if course_description:
        context_parts.append(f"DESCRIPTION: {course_description}")
    if topics:
        context_parts.append(f"KEY TOPICS: {', '.join(topics)}")
    if course_outline:
        sections = [s.get("title", "") for s in course_outline[:12]]
        context_parts.append(f"SECTIONS: {', '.join(sections)}")

    context = "\n".join(context_parts)

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=QUIZ_PROMPT,
        messages=[{"role": "user", "content": f"Generate a placement quiz for this course:\n\n{context}"}],
    )

    text = response.content[0].text
    # Parse JSON — handle code blocks
    if "```json" in text:
        start = text.find("```json") + len("```json")
        end = text.find("```", start)
        if end != -1:
            text = text[start:end]
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        if end != -1:
            candidate = text[start:end].strip()
            if candidate.startswith("{"):
                text = candidate
    elif "{" in text:
        first = text.find("{")
        last = text.rfind("}")
        if first != -1 and last != -1 and last > first:
            text = text[first:last + 1]

    try:
        quiz = json.loads(text.strip())
    except (json.JSONDecodeError, IndexError):
        # Fallback: return a minimal quiz
        quiz = {
            "quiz_title": f"Quick Check: {course_title}",
            "questions": [
                {
                    "id": 1,
                    "type": "multiple_choice",
                    "difficulty": 1,
                    "question": f"How familiar are you with {course_title}?",
                    "context": None,
                    "options": [
                        {"id": "a", "text": "Completely new to me"},
                        {"id": "b", "text": "I've heard of it but never studied it"},
                        {"id": "c", "text": "I have some hands-on experience"},
                        {"id": "d", "text": "I'm quite experienced with this"},
                    ],
                    "correct_answer": None,
                    "explanation": "This helps us calibrate your learning experience.",
                }
            ],
        }

    return quiz


def score_quiz(questions: list[dict], answers: dict[str, str]) -> dict:
    """Score a completed quiz and determine the learner's level.

    Args:
        questions: The quiz questions (with correct_answer)
        answers: Dict of question_id -> selected_option_id (e.g. {"1": "b", "2": "a"})

    Returns:
        Dict with score breakdown and recommended teach_depth.
    """
    total = len(questions)
    correct = 0
    by_difficulty = {1: {"total": 0, "correct": 0}, 2: {"total": 0, "correct": 0}, 3: {"total": 0, "correct": 0}}

    results = []
    for q in questions:
        qid = str(q["id"])
        user_answer = answers.get(qid)
        is_correct = user_answer == q.get("correct_answer") if q.get("correct_answer") else None
        diff = q.get("difficulty", 1)

        if is_correct is not None:
            if is_correct:
                correct += 1
            by_difficulty[diff]["total"] += 1
            by_difficulty[diff]["correct"] += int(is_correct)

        results.append({
            "id": q["id"],
            "correct": is_correct,
            "user_answer": user_answer,
            "correct_answer": q.get("correct_answer"),
            "explanation": q.get("explanation", ""),
        })

    # Determine teach depth based on performance
    pct = correct / total if total > 0 else 0
    advanced_pct = (
        by_difficulty[3]["correct"] / by_difficulty[3]["total"]
        if by_difficulty[3]["total"] > 0
        else 0
    )
    basic_pct = (
        by_difficulty[1]["correct"] / by_difficulty[1]["total"]
        if by_difficulty[1]["total"] > 0
        else 0
    )

    if pct >= 0.75 and advanced_pct >= 0.5:
        teach_depth = "advanced"
        familiarity = "advanced"
        skip_to_mode = "challenge"
    elif pct >= 0.5 and basic_pct >= 0.66:
        teach_depth = "intermediate"
        familiarity = "intermediate"
        skip_to_mode = "teach"
    else:
        teach_depth = "foundational"
        familiarity = "none" if pct < 0.25 else "basic"
        skip_to_mode = "teach"

    return {
        "score": correct,
        "total": total,
        "percentage": round(pct * 100),
        "by_difficulty": by_difficulty,
        "results": results,
        "teach_depth": teach_depth,
        "familiarity": familiarity,
        "skip_to_mode": skip_to_mode,
    }
