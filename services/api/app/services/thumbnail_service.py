"""Generate course thumbnail images using Gemini Imagen (primary) or DALL-E 3 (fallback)."""

import httpx
import base64
import uuid
import logging
from pathlib import Path
from app.core.config import get_settings

logger = logging.getLogger(__name__)

THUMBNAILS_DIR = Path(__file__).parent.parent.parent / "static" / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

CATEGORY_STYLES = {
    "coding": "abstract digital technology, code patterns, neural networks, dark background with glowing circuits",
    "business": "professional corporate abstract, strategic planning, golden and navy colors, leadership",
    "science": "scientific illustration, molecular structures, cosmos, teal and emerald hues",
    "creative": "artistic expression, vibrant colors, creative design elements, inspiration",
    "general": "modern education, knowledge and growth, clean professional design, indigo and purple tones",
}


def _build_prompt(title: str, description: str | None, category: str) -> str:
    style_hint = CATEGORY_STYLES.get(category, CATEGORY_STYLES["general"])
    short_desc = (description or "")[:120]
    return (
        f"Create a beautiful, modern course thumbnail illustration for an online learning course. "
        f"Course title: '{title}'. {f'About: {short_desc}. ' if short_desc else ''}"
        f"Style: {style_hint}. "
        f"Requirements: Abstract and professional, no text or words in the image, "
        f"suitable as a course card thumbnail, visually striking with depth and dimension, "
        f"16:9 aspect ratio composition, modern gradient aesthetic."
    )


def _save_image(image_bytes: bytes, title: str) -> str:
    filename = f"{uuid.uuid4().hex}.png"
    filepath = THUMBNAILS_DIR / filename
    filepath.write_bytes(image_bytes)
    logger.info(f"Saved thumbnail for '{title}': {filename} ({len(image_bytes)} bytes)")
    return f"/static/thumbnails/{filename}"


async def _try_gemini(client: httpx.AsyncClient, api_key: str, prompt: str) -> bytes | None:
    """Try Gemini 2.5 Flash Image (generateContent with IMAGE modality)."""
    try:
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": f"Generate an image: {prompt}"}]}],
                "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
            },
        )
        if r.status_code != 200:
            logger.warning(f"Gemini Flash Image: {r.status_code} — {r.text[:150]}")
            return None

        parts = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData", {})
            if inline.get("mimeType", "").startswith("image/"):
                return base64.b64decode(inline["data"])

        logger.warning("Gemini Flash Image returned no image data")
        return None
    except Exception as e:
        logger.warning(f"Gemini Flash Image failed: {e}")
        return None


async def _try_dalle(client: httpx.AsyncClient, openai_key: str, prompt: str) -> bytes | None:
    """Fallback to DALL-E 3."""
    try:
        r = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
            json={"model": "dall-e-3", "prompt": prompt, "n": 1, "size": "1792x1024", "quality": "standard"},
        )
        if r.status_code != 200:
            logger.warning(f"DALL-E 3: {r.status_code} — {r.text[:150]}")
            return None

        image_url = r.json()["data"][0]["url"]
        img_r = await client.get(image_url)
        return img_r.content if img_r.status_code == 200 else None
    except Exception as e:
        logger.warning(f"DALL-E 3 failed: {e}")
        return None


async def generate_course_thumbnail(
    title: str,
    description: str | None = None,
    category: str = "general",
) -> str | None:
    """Generate a thumbnail. Tries Gemini first, falls back to DALL-E 3."""
    settings = get_settings()
    prompt = _build_prompt(title, description, category)

    async with httpx.AsyncClient(timeout=90.0) as client:
        # Try Gemini first
        if settings.GEMINI_API_KEY:
            image_bytes = await _try_gemini(client, settings.GEMINI_API_KEY, prompt)
            if image_bytes:
                return _save_image(image_bytes, title)

        # Fallback to DALL-E
        if settings.OPENAI_API_KEY:
            image_bytes = await _try_dalle(client, settings.OPENAI_API_KEY, prompt)
            if image_bytes:
                return _save_image(image_bytes, title)

    logger.error(f"All thumbnail providers failed for '{title}'")
    return None


async def generate_thumbnails_for_courses(db_session, courses: list) -> dict:
    """Generate thumbnails for multiple courses."""
    from sqlalchemy.orm.attributes import flag_modified

    results = {}
    for course in courses:
        if course.thumbnail_url:
            continue

        url = await generate_course_thumbnail(
            title=course.title,
            description=course.description,
            category=course.course_category.value if course.course_category else "general",
        )
        if url:
            course.thumbnail_url = url
            flag_modified(course, "thumbnail_url")
            results[str(course.id)] = url

    await db_session.commit()
    return results
