"""AI-powered course generation using Claude."""

import json
import logging
import re
import anthropic
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _robust_parse_json(text: str) -> dict | list:
    """Best-effort JSON extraction from Claude response — handles code blocks, preamble, etc."""
    # Try 1: direct parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try 2: extract from ```json ... ```
    if "```json" in text:
        start = text.find("```json") + len("```json")
        end = text.find("```", start)
        if end != -1:
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                pass

    # Try 3: extract from ``` ... ```
    if "```" in text:
        parts = text.split("```")
        for i in range(1, len(parts), 2):  # Odd indices are inside code blocks
            candidate = parts[i].strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{") or candidate.startswith("["):
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    pass

    # Try 4: find the first { ... } or [ ... ] block
    for open_char, close_char in [("{", "}"), ("[", "]")]:
        first = text.find(open_char)
        last = text.rfind(close_char)
        if first != -1 and last != -1 and last > first:
            try:
                return json.loads(text[first:last + 1])
            except json.JSONDecodeError:
                pass

    # Try 5: strip trailing comma issues and retry
    cleaned = re.sub(r',\s*([}\]])', r'\1', text)
    try:
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        pass

    raise json.JSONDecodeError(f"Could not extract JSON from response (length={len(text)})", text, 0)

ANALYSIS_PROMPT = """You are the course design engine for Nexus², an adaptive mastery learning platform.

Analyze the following educational content and generate a structured course specification.

The Nexus² mastery model:
- Mastery levels 1-5 (1=Novice, 2=Developing, 3=Proficient, 4=Advanced, 5=Expert)
- Criteria = specific, measurable competencies a learner must demonstrate
- Scenarios = realistic practice situations with Socratic AI coaching
- Domains = distinct capability areas (e.g., "Analytical Thinking", "Communication")

Return ONLY valid JSON with this structure:
{
    "title": "string — concise course title",
    "description": "string — 2-3 sentence description",
    "course_category": "coding | business | science | creative | general — pick the ONE category that best matches the content. coding = programming, software engineering, DevOps, data engineering. business = strategy, marketing, finance, management, leadership, sales, MBA-style content. science = math, physics, chemistry, biology, engineering, medicine, research. creative = design, writing, art, music, media, UX. general = everything else (soft skills, language learning, history, compliance, etc.)",
    "domain": "string — primary domain (e.g., Professional, Academic, Corporate)",
    "difficulty_level": "beginner | intermediate | advanced",
    "estimated_hours": number,
    "mastery_criteria": [
        {"name": "string", "description": "string", "target_level": number (1-5)}
    ],
    "topics": ["string"],
    "scenarios": [
        {"title": "string", "description": "string", "difficulty": number (1-5), "turns": number (8-15)}
    ],
    "domains": [
        {
            "name": "string — domain name",
            "capabilities": [
                {"name": "string", "target_level": number (1-5), "description": "string"}
            ]
        }
    ]
}

Generate 3-5 mastery criteria, 3-5 scenarios, and 2-4 domains with 2-4 capabilities each.
"""


async def analyze_content_for_course(text_content: str, image_descriptions: list[str] | None = None) -> dict:
    """
    Send extracted text + image descriptions to Claude Sonnet for course analysis.

    - Handles large documents by intelligently truncating
    - Includes image descriptions for visual content understanding
    - Retries on parse failure with a stricter prompt
    - Robust JSON parsing that handles code blocks, preamble, etc.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Build content — include image descriptions if available
    content_parts = [f"Analyze this content and generate the course specification:\n\n{text_content[:60000]}"]

    if image_descriptions:
        img_section = "\n\n--- VISUAL CONTENT DESCRIPTIONS ---\n" + "\n".join(
            f"• {desc}" for desc in image_descriptions[:15]
        )
        content_parts.append(img_section)

    user_message = "".join(content_parts)

    # Retry loop — up to 2 attempts
    last_error = None
    for attempt in range(2):
        try:
            system = ANALYSIS_PROMPT
            if attempt > 0:
                system += "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object — no markdown, no explanation, no text before or after the JSON."

            response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )

            text = response.content[0].text
            result = _robust_parse_json(text)

            # Validate required fields
            if isinstance(result, dict) and "title" in result:
                return result
            else:
                raise ValueError(f"Response missing required 'title' field: {list(result.keys()) if isinstance(result, dict) else type(result)}")

        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            logger.warning(f"Course analysis attempt {attempt + 1} failed: {e}")
            continue
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error during course analysis: {e}")
            raise

    raise RuntimeError(f"Course analysis failed after 2 attempts: {last_error}")


OUTLINE_PROMPT = """You are a curriculum designer for an adaptive learning platform. Given course content and AI-generated metadata, create a detailed TEACHING OUTLINE with supporting visuals.

This outline will be used by an AI tutor to systematically walk a learner through the material. Each section should:
1. Cover ONE coherent topic
2. Be teachable in 3-6 conversational exchanges
3. Build on the previous section
4. Have clear learning objectives
5. Include 1-2 supporting visuals (diagrams, charts, or tables)

Return ONLY valid JSON — an array of sections in teaching order:
[
  {
    "id": 1,
    "title": "Section title — clear and specific",
    "description": "What the learner will understand after this section (1-2 sentences)",
    "key_concepts": ["concept1", "concept2", "concept3"],
    "estimated_exchanges": 4,
    "prerequisite_ids": [],
    "visuals": [
      {
        "type": "mermaid",
        "title": "Descriptive title for the diagram",
        "caption": "One sentence explaining what this diagram shows",
        "content": "graph TD\\n  A[Step 1] --> B[Step 2]\\n  B --> C[Step 3]"
      }
    ]
  }
]

VISUAL RULES:
- Each topic should have 1-2 visuals. At least ONE visual per topic.
- Visual types:
  - "mermaid": For flowcharts, process diagrams, decision trees, mind maps, sequence diagrams.
    Use Mermaid.js syntax. Keep diagrams simple (5-10 nodes max). Use short, clear labels.
    Supported diagram types: graph TD, graph LR, flowchart TD, sequenceDiagram, pie, mindmap
  - "chart": For data comparisons, distributions, trends.
    Include chart_type ("bar", "pie", "line") and a "data" array.
    Example: {"type": "chart", "title": "Market Share", "chart_type": "pie", "caption": "...", "data": [{"name": "Segment A", "value": 45}, {"name": "Segment B", "value": 30}]}
  - "table": For comparisons, feature matrices, before/after.
    Include "headers" (array of strings) and "rows" (array of arrays).
    Example: {"type": "table", "title": "B2B vs B2C", "caption": "...", "headers": ["Factor", "B2B", "B2C"], "rows": [["Sales Cycle", "Long", "Short"]]}

- Make visuals SPECIFIC to the course content, not generic templates.
- Mermaid diagrams must use valid Mermaid.js syntax.
- For mermaid: escape special characters in labels. Avoid parentheses inside node labels — use square brackets [].
- Charts should have realistic, illustrative data that supports the teaching point.
- Tables should be concise: 3-6 rows max.

OTHER RULES:
- Create 5-12 sections depending on content depth
- First section should be foundational/introductory
- Last section should be synthesis/application
- Each section title should be specific, not generic
- key_concepts should be 2-5 specific terms/ideas
- estimated_exchanges is typically 3-6
"""


def _validate_mermaid(content: str) -> bool:
    """Basic validation that Mermaid content has a valid diagram type declaration."""
    content = content.strip()
    valid_starts = ["graph ", "flowchart ", "sequenceDiagram", "pie", "mindmap", "classDiagram", "stateDiagram"]
    return any(content.startswith(s) for s in valid_starts)


def _sanitize_visuals(visuals: list[dict]) -> list[dict]:
    """Remove visuals with invalid Mermaid syntax."""
    sanitized = []
    for v in visuals:
        if v.get("type") == "mermaid":
            if v.get("content") and _validate_mermaid(v["content"]):
                sanitized.append(v)
        elif v.get("type") in ("chart", "table"):
            sanitized.append(v)
    return sanitized


async def generate_course_outline(text_content: str, metadata: dict) -> list[dict]:
    """Generate a structured teaching outline with visuals from course content."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"""COURSE METADATA:
Title: {metadata.get('title', 'Unknown')}
Description: {metadata.get('description', '')}
Topics: {json.dumps(metadata.get('topics', []))}
Mastery Criteria: {json.dumps(metadata.get('mastery_criteria', []))}
Domains: {json.dumps(metadata.get('domains', []))}

COURSE CONTENT (first 30000 chars):
{text_content[:30000]}
"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        system=OUTLINE_PROMPT,
        messages=[{"role": "user", "content": context}],
    )

    text = response.content[0].text
    outline = _robust_parse_json(text)

    if not isinstance(outline, list):
        raise ValueError(f"Expected outline to be a list, got {type(outline)}")

    for i, section in enumerate(outline):
        section["id"] = i + 1
        section["visuals"] = _sanitize_visuals(section.get("visuals", []))

    return outline
