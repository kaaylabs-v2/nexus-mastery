"""Generate course thumbnail images using DALL-E 3 via OpenAI API."""

import httpx
import os
import uuid
import logging
from pathlib import Path
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Directory to store generated thumbnails
THUMBNAILS_DIR = Path(__file__).parent.parent.parent / "static" / "thumbnails"
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Category-specific style hints for better thumbnails
CATEGORY_STYLES = {
    "coding": "abstract digital technology, code patterns, neural networks, dark background with glowing circuits",
    "business": "professional corporate abstract, strategic planning, golden and navy colors, leadership",
    "science": "scientific illustration, molecular structures, cosmos, teal and emerald hues",
    "creative": "artistic expression, vibrant colors, creative design elements, inspiration",
    "general": "modern education, knowledge and growth, clean professional design, indigo and purple tones",
}


async def generate_course_thumbnail(
    title: str,
    description: str | None = None,
    category: str = "general",
) -> str | None:
    """
    Generate a thumbnail for a course using DALL-E 3.
    Returns the relative URL path to the saved image, or None on failure.
    """
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        logger.warning("No OpenAI API key — skipping thumbnail generation")
        return None

    style_hint = CATEGORY_STYLES.get(category, CATEGORY_STYLES["general"])
    short_desc = (description or "")[:120]

    prompt = (
        f"Create a beautiful, modern course thumbnail illustration for an online learning course. "
        f"Course title: '{title}'. {f'About: {short_desc}. ' if short_desc else ''}"
        f"Style: {style_hint}. "
        f"Requirements: Abstract and professional, no text or words in the image, "
        f"suitable as a course card thumbnail, visually striking with depth and dimension, "
        f"16:9 aspect ratio composition, modern gradient aesthetic."
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "n": 1,
                    "size": "1792x1024",
                    "quality": "standard",
                },
            )

            if response.status_code != 200:
                logger.error(f"DALL-E API error {response.status_code}: {response.text[:200]}")
                return None

            data = response.json()
            image_url = data["data"][0]["url"]

            # Download the image
            img_response = await client.get(image_url)
            if img_response.status_code != 200:
                logger.error("Failed to download generated image")
                return None

            # Save locally
            filename = f"{uuid.uuid4().hex}.png"
            filepath = THUMBNAILS_DIR / filename
            filepath.write_bytes(img_response.content)

            # Return the URL path that will be served by FastAPI static files
            return f"/static/thumbnails/{filename}"

    except Exception as e:
        logger.error(f"Thumbnail generation failed: {e}")
        return None


async def generate_thumbnails_for_courses(db_session, courses: list) -> dict:
    """Generate thumbnails for multiple courses. Returns {course_id: thumbnail_url}."""
    from app.models.course import Course
    from sqlalchemy.orm.attributes import flag_modified

    results = {}
    for course in courses:
        if course.thumbnail_url:
            continue  # Already has a thumbnail

        url = await generate_course_thumbnail(
            title=course.title,
            description=course.description,
            category=course.course_category.value if course.course_category else "general",
        )
        if url:
            course.thumbnail_url = url
            flag_modified(course, "thumbnail_url")
            results[str(course.id)] = url
            logger.info(f"Generated thumbnail for course '{course.title}': {url}")

    await db_session.commit()
    return results
