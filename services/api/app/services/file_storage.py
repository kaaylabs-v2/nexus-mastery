import os
import uuid
from datetime import date
from pathlib import Path
from uuid import UUID
from fastapi import UploadFile, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.models.course_file import CourseFile

settings = get_settings()

ALLOWED_TYPES = {"pdf", "docx", "txt", "md", "pptx", "csv", "xlsx"}
MAX_SIZE = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


async def save_uploaded_file(
    file: UploadFile,
    org_id: UUID,
    uploaded_by: UUID,
    db: AsyncSession,
) -> CourseFile:
    """Validate, save to disk, create DB record."""
    ext = _get_extension(file.filename or "unknown")
    if ext not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_TYPES)}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, f"File too large. Max {settings.MAX_UPLOAD_SIZE_MB}MB")

    # Build storage path: {UPLOAD_DIR}/{org_id}/{date}/{uuid.ext}
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    rel_dir = os.path.join(str(org_id), date.today().isoformat())
    full_dir = os.path.join(settings.UPLOAD_DIR, rel_dir)
    Path(full_dir).mkdir(parents=True, exist_ok=True)

    full_path = os.path.join(full_dir, unique_name)
    with open(full_path, "wb") as f:
        f.write(content)

    course_file = CourseFile(
        org_id=org_id,
        filename=unique_name,
        original_filename=file.filename or "unknown",
        file_type=ext,
        file_size=len(content),
        storage_path=os.path.join(rel_dir, unique_name),
        upload_status="uploaded",
        uploaded_by=uploaded_by,
    )
    db.add(course_file)
    await db.flush()
    await db.refresh(course_file)
    return course_file


async def get_file_path(file_id: UUID, org_id: UUID, db: AsyncSession) -> str:
    """Return full path, enforce org_id match."""
    result = await db.execute(
        select(CourseFile).where(CourseFile.id == file_id, CourseFile.org_id == org_id)
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(404, "File not found")
    return os.path.join(settings.UPLOAD_DIR, cf.storage_path)


async def delete_file(file_id: UUID, org_id: UUID, db: AsyncSession) -> None:
    """Delete from disk and DB."""
    result = await db.execute(
        select(CourseFile).where(CourseFile.id == file_id, CourseFile.org_id == org_id)
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(404, "File not found")

    full_path = os.path.join(settings.UPLOAD_DIR, cf.storage_path)
    if os.path.exists(full_path):
        os.remove(full_path)

    await db.delete(cf)
    await db.commit()


async def list_course_files(course_id: UUID, org_id: UUID, db: AsyncSession) -> list[CourseFile]:
    """List files for a course, scoped by org."""
    result = await db.execute(
        select(CourseFile).where(CourseFile.course_id == course_id, CourseFile.org_id == org_id)
    )
    return list(result.scalars().all())
