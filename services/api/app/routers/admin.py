"""Admin API routes — all require org_admin role, scoped by org_id."""

import csv
import io
import os
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db, async_session
from app.middleware.auth import get_current_user
from app.middleware.tenant import get_current_org_id
from app.models.user import User, UserRole
from app.models.course import Course, SourceType, CourseStatus, CourseCategory
from app.models.enrollment import Enrollment
from app.models.program import Category, Domain, Capability, FocusSession, Milestone
from app.models.course_file import CourseFile
from app.models.ingestion_job import IngestionJob, IngestionStatus
from app.models.organization import Organization
from app.models.conversation import Conversation
from app.models.mastery_profile import MasteryProfile
from app.services.file_storage import save_uploaded_file, delete_file
from app.services.course_generator import analyze_content_for_course, generate_course_outline
from app.services.rag_pipeline import extract_text_from_file, _chunk_text, embed_text
from app.services.document_extractor import extract_document, describe_images, smart_chunk
from app.models.content_embedding import ContentEmbedding
from app.schemas.admin import (
    CourseFileResponse, UploadResponse, GenerateCourseRequest,
    IngestionJobResponse, AdminUserResponse, InviteUserRequest,
    BulkImportRow, BulkImportResponse, AnalyticsOverviewResponse,
    CourseAnalyticsResponse, UpdateOrgSettingsRequest,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
settings = get_settings()


def _require_admin(user: User):
    if user.role != UserRole.org_admin:
        raise HTTPException(403, "Admin role required")


# ─── File Upload ──────────────────────────────────────────────────────────────


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    results = []
    for file in files:
        cf = await save_uploaded_file(file, org_id, user.id, db)
        results.append(cf)
    return {"files": results}


@router.delete("/files/{file_id}", status_code=204)
async def remove_file(
    file_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    await delete_file(file_id, org_id, db)


# ─── Course Generation ───────────────────────────────────────────────────────


async def _run_ingestion(job_id: UUID, file_ids: list[UUID], org_id: UUID, created_by: UUID):
    """
    Background task: comprehensive document extraction → Claude analysis → Course + Program.

    Pipeline stages:
    1. Extract — pull ALL content (text, tables, images) from every uploaded file
    2. Describe — use Claude Vision to describe extracted images
    3. Analyze — send full structured text + image descriptions to Claude Sonnet
    4. Structure — create Course, Program, Domains, Capabilities, Focus Sessions
    5. Embed — structure-aware chunking + vector embeddings for RAG
    6. Outline — generate detailed teaching outline with visuals
    """
    import logging
    logger = logging.getLogger(__name__)

    async with async_session() as db:
        result = await db.execute(select(IngestionJob).where(IngestionJob.id == job_id))
        job = result.scalar_one()

        try:
            # ── Stage 1: Deep document extraction ──
            job.status = "extracting"
            job.progress_pct = 5
            job.current_step = "Reading your documents — extracting text, tables, and images"
            await db.commit()

            all_docs = []
            all_text_parts = []
            all_images = []

            for fid in file_ids:
                cf_result = await db.execute(select(CourseFile).where(CourseFile.id == fid))
                cf = cf_result.scalar_one_or_none()
                if cf:
                    file_path = os.path.join(settings.UPLOAD_DIR, cf.storage_path)
                    if os.path.exists(file_path):
                        try:
                            doc = extract_document(file_path)
                            all_docs.append(doc)
                            all_text_parts.append(doc.text)
                            all_images.extend(doc.images)
                            logger.info(
                                f"Extracted {cf.original_filename}: "
                                f"{doc.word_count} words, {len(doc.images)} images, "
                                f"{doc.metadata.get('tables', 0)} tables"
                            )
                        except Exception as e:
                            logger.error(f"Extraction failed for {cf.original_filename}: {e}")
                            # Fallback to old extractor
                            try:
                                text = extract_text_from_file(file_path)
                                all_text_parts.append(text)
                            except Exception:
                                all_text_parts.append(f"[Could not extract {cf.original_filename}: {e}]")

            all_text = "\n\n".join(all_text_parts)
            job.progress_pct = 15
            job.current_step = f"Extracted {len(all_text):,} characters, {len(all_images)} images"
            await db.commit()

            # ── Stage 1b: Describe images with Claude Vision ──
            image_descriptions = []
            if all_images:
                job.progress_pct = 20
                job.current_step = f"Analyzing {len(all_images)} images with AI vision"
                await db.commit()

                try:
                    described = await describe_images(all_images, context=all_text[:500])
                    image_descriptions = [
                        f"{img.source_location}: {img.description}"
                        for img in described
                        if img.description and not img.description.startswith("[Small")
                    ]
                    logger.info(f"Described {len(image_descriptions)} images")
                except Exception as e:
                    logger.warning(f"Image description failed (non-fatal): {e}")

            # ── Stage 2: Claude analysis (with images + retry) ──
            job.status = "analyzing"
            job.progress_pct = 30
            job.current_step = "Analyzing content with AI — understanding structure and learning objectives"
            await db.commit()

            metadata = await analyze_content_for_course(all_text, image_descriptions or None)
            job.ai_generated_metadata = metadata
            job.progress_pct = 55
            await db.commit()

            # ── Stage 3: Create Course + Program ──
            job.status = "structuring"
            job.progress_pct = 60
            job.current_step = "Building course structure"
            await db.commit()

            # Infer course category from AI analysis
            raw_category = metadata.get("course_category", "general")
            try:
                inferred_category = CourseCategory(raw_category)
            except ValueError:
                inferred_category = CourseCategory.general

            course = Course(
                org_id=org_id,
                title=metadata.get("title", "Untitled Course"),
                description=metadata.get("description", ""),
                type="custom",
                course_category=inferred_category,
                source_type=SourceType.uploaded,
                ai_generated_metadata=metadata,
                mastery_criteria={"criteria": metadata.get("mastery_criteria", [])},
                status=CourseStatus.draft,
            )
            db.add(course)
            await db.flush()

            # Create Category from metadata
            category = Category(
                org_id=org_id,
                name=metadata.get("title", "Untitled Category"),
                objective=metadata.get("description", ""),
                target_level=5.0,
                baseline_level=0.0,
                current_level=0.0,
            )
            db.add(category)
            await db.flush()

            # Create domains + capabilities
            for domain_data in metadata.get("domains", []):
                domain = Domain(program_id=category.id, domain_name=domain_data.get("name", ""))
                db.add(domain)
                await db.flush()
                for cap_data in domain_data.get("capabilities", []):
                    db.add(Capability(
                        domain_id=domain.id,
                        name=cap_data.get("name", ""),
                        target_level=cap_data.get("target_level", 3),
                        status="attention",
                        trend="stable",
                    ))

            # Create focus sessions from scenarios
            for scenario in metadata.get("scenarios", []):
                db.add(FocusSession(
                    program_id=category.id,
                    title=scenario.get("title", ""),
                    difficulty=["Foundational", "Intermediate", "Advanced"][min(scenario.get("difficulty", 2) - 1, 2)],
                    duration=f"{scenario.get('turns', 10) * 4} min",
                    category=metadata.get("domain", "General"),
                ))

            # Link course to category
            course.program_id = category.id

            # Link files to course
            for fid in file_ids:
                await db.execute(
                    update(CourseFile).where(CourseFile.id == fid).values(course_id=course.id)
                )

            # ── Stage 4: Structure-aware RAG indexing ──
            job.status = "embedding"
            job.progress_pct = 70
            job.current_step = "Indexing content for AI tutor — smart chunking"
            await db.commit()

            try:
                # Use structure-aware chunking if we have extracted docs
                if all_docs:
                    chunks = []
                    for doc in all_docs:
                        chunks.extend(smart_chunk(doc, max_chunk_size=1500, overlap=200))
                else:
                    # Fallback to naive chunking
                    chunks = _chunk_text(all_text)

                job.chunks_total = len(chunks)
                await db.commit()
                logger.info(f"Created {len(chunks)} chunks for embedding")

                for i, chunk_text in enumerate(chunks):
                    try:
                        embedding = await embed_text(chunk_text)
                        db.add(ContentEmbedding(
                            course_id=course.id,
                            chunk_text=chunk_text,
                            chunk_metadata={"source": "ingestion", "index": i},
                            embedding=embedding,
                        ))
                        job.chunks_processed = i + 1
                        if i % 5 == 0:
                            job.progress_pct = 70 + int((i / len(chunks)) * 15)
                            await db.commit()
                    except Exception as e:
                        logger.warning(f"Embedding chunk {i} failed: {e}")
                        continue

                await db.commit()
            except Exception as e:
                logger.warning(f"RAG indexing failed (non-fatal): {e}")

            # ── Stage 5: Generate teaching outline ──
            job.status = "generating_outline"
            job.current_step = "Generating teaching outline with visuals"
            job.progress_pct = 88
            await db.commit()
            try:
                outline = await generate_course_outline(all_text, metadata)
                course.course_outline = outline
                job.ai_generated_metadata = {
                    **(job.ai_generated_metadata or {}),
                    "course_outline": outline,
                    "extraction_stats": {
                        "total_words": sum(d.word_count for d in all_docs),
                        "total_images": len(all_images),
                        "images_described": len(image_descriptions),
                        "chunks_created": len(chunks) if 'chunks' in dir() else 0,
                        "tables_extracted": sum(d.metadata.get("tables", 0) for d in all_docs),
                    },
                }
                job.progress_pct = 98
                job.current_step = f"Generated {len(outline)} teaching modules"
                await db.commit()
            except Exception as e:
                logger.warning(f"Outline generation failed: {e}")

            # ── Complete ──
            job.status = "completed"
            job.progress_pct = 100
            job.current_step = "Complete"
            job.course_id = course.id
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            logger.error(f"Ingestion failed for job {job_id}: {e}", exc_info=True)
            job.status = "failed"
            job.error_message = str(e)
            job.current_step = "Failed"
            await db.commit()


@router.post("/courses/generate", response_model=IngestionJobResponse)
async def generate_course(
    data: GenerateCourseRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    job = IngestionJob(
        org_id=org_id,
        status="queued",
        file_ids=[str(fid) for fid in data.file_ids],
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    background_tasks.add_task(_run_ingestion, job.id, data.file_ids, org_id, user.id)
    return job


async def _run_prompt_ingestion(job_id: UUID, prompt: str, org_id: UUID, created_by: UUID):
    """Background task: generate a course purely from a text prompt (no files)."""
    async with async_session() as db:
        result = await db.execute(select(IngestionJob).where(IngestionJob.id == job_id))
        job = result.scalar_one()

        try:
            # Stage 1: AI analysis from prompt
            job.status = "analyzing"
            job.progress_pct = 20
            job.current_step = "Analyzing your topic with AI"
            await db.commit()

            metadata = await analyze_content_for_course(prompt)
            job.ai_generated_metadata = metadata
            job.progress_pct = 50
            await db.commit()

            # Stage 2: Create Course + Program
            job.status = "structuring"
            job.progress_pct = 60
            job.current_step = "Building course structure"
            await db.commit()

            course = Course(
                org_id=org_id,
                title=metadata.get("title", "Untitled Course"),
                description=metadata.get("description", ""),
                type="custom",
                source_type="manual",
                ai_generated_metadata=metadata,
                mastery_criteria={"criteria": metadata.get("mastery_criteria", [])},
                status=CourseStatus.draft,
            )
            # Set course_category if provided
            cat = metadata.get("course_category", "general")
            from app.models.course import CourseCategory
            if cat in [e.value for e in CourseCategory]:
                course.course_category = CourseCategory(cat)

            db.add(course)
            await db.flush()

            category = Category(
                org_id=org_id,
                name=metadata.get("title", "Untitled Category"),
                objective=metadata.get("description", ""),
                target_level=5.0, baseline_level=0.0, current_level=0.0,
            )
            db.add(category)
            await db.flush()

            for domain_data in metadata.get("domains", []):
                domain = Domain(program_id=category.id, domain_name=domain_data.get("name", ""))
                db.add(domain)
                await db.flush()
                for cap_data in domain_data.get("capabilities", []):
                    db.add(Capability(
                        domain_id=domain.id, name=cap_data.get("name", ""),
                        target_level=cap_data.get("target_level", 3), status="attention", trend="stable",
                    ))

            for scenario in metadata.get("scenarios", []):
                db.add(FocusSession(
                    program_id=category.id, title=scenario.get("title", ""),
                    difficulty=["Foundational", "Intermediate", "Advanced"][min(scenario.get("difficulty", 2) - 1, 2)],
                    duration=f"{scenario.get('turns', 10) * 4} min",
                    category=metadata.get("domain", "General"),
                ))

            course.program_id = category.id
            await db.commit()

            # Stage 3: Generate teaching outline with visuals
            job.status = "generating_outline"
            job.progress_pct = 80
            job.current_step = "Generating teaching outline with visuals"
            await db.commit()

            try:
                outline = await generate_course_outline(prompt, metadata)
                course.course_outline = outline
                job.ai_generated_metadata = {**(job.ai_generated_metadata or {}), "course_outline": outline}
                job.progress_pct = 95
                job.current_step = f"Generated {len(outline)} teaching modules"
                await db.commit()
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Outline generation failed: {e}")

            # Complete
            job.status = "completed"
            job.progress_pct = 100
            job.current_step = "Complete"
            job.course_id = course.id
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)[:500]
            job.current_step = "Failed"
            await db.commit()


@router.post("/courses/generate-from-prompt", response_model=IngestionJobResponse)
async def generate_course_from_prompt(
    data: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate a course from a text description — no file upload needed."""
    _require_admin(user)

    prompt = data.get("prompt", "").strip()
    if not prompt or len(prompt) < 10:
        raise HTTPException(400, "Please provide a topic description (at least 10 characters)")

    job = IngestionJob(
        org_id=org_id,
        status="queued",
        file_ids=[],
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    background_tasks.add_task(_run_prompt_ingestion, job.id, prompt, org_id, user.id)
    return job


@router.get("/ingestion/{job_id}", response_model=IngestionJobResponse)
async def poll_ingestion(
    job_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(
        select(IngestionJob).where(IngestionJob.id == job_id, IngestionJob.org_id == org_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ─── Course Publishing ────────────────────────────────────────────────────────


@router.post("/courses/{course_id}/publish")
async def publish_course(
    course_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(select(Course).where(Course.id == course_id, Course.org_id == org_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")
    course.published_at = datetime.now(timezone.utc)
    course.status = CourseStatus.active

    # Auto-generate thumbnail if missing
    if not course.thumbnail_url:
        try:
            from app.services.thumbnail_service import generate_course_thumbnail
            url = await generate_course_thumbnail(
                title=course.title,
                description=course.description,
                category=course.course_category.value if course.course_category else "general",
            )
            if url:
                course.thumbnail_url = url
        except Exception:
            pass  # Don't block publish if thumbnail fails

    await db.commit()
    return {"status": "published", "thumbnail_url": course.thumbnail_url}


@router.post("/courses/{course_id}/unpublish")
async def unpublish_course(
    course_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(select(Course).where(Course.id == course_id, Course.org_id == org_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")
    course.published_at = None
    course.status = CourseStatus.draft
    await db.commit()
    return {"status": "draft"}


# ─── User Management ─────────────────────────────────────────────────────────


@router.get("/users")
async def list_users(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    # Single query with LEFT JOIN — no N+1
    stmt = (
        select(User, func.count(Enrollment.id).label("enrollment_count"))
        .outerjoin(Enrollment, Enrollment.user_id == User.id)
        .where(User.org_id == org_id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )
    results = (await db.execute(stmt)).all()

    return [
        {
            "id": str(u.id),
            "display_name": u.display_name,
            "email": u.email,
            "role": u.role.value,
            "enrolled_courses_count": count,
            "created_at": u.created_at.isoformat(),
        }
        for u, count in results
    ]


@router.post("/users/invite")
async def invite_user(
    data: InviteUserRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "User with this email already exists")

    new_user = User(
        email=data.email,
        display_name=data.email.split("@")[0],
        role=UserRole(data.role),
        org_id=org_id,
        auth0_sub=f"auth0|pending-{uuid.uuid4().hex[:12]}",
    )
    db.add(new_user)
    await db.flush()
    return {"id": str(new_user.id), "email": new_user.email, "status": "invited"}


@router.post("/users/bulk-import", response_model=BulkImportResponse)
async def bulk_import_users(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))

    valid = []
    errors = []
    for row in reader:
        name = row.get("name", "").strip()
        email = row.get("email", "").strip()
        role = row.get("role", "learner").strip()

        import re
        if not email or not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            errors.append(BulkImportRow(name=name, email=email, role=role, valid=False, error="Invalid email"))
        elif role not in ("learner", "facilitator", "org_admin"):
            errors.append(BulkImportRow(name=name, email=email, role=role, valid=False, error="Invalid role"))
        else:
            valid.append(BulkImportRow(name=name, email=email, role=role))

    return BulkImportResponse(total=len(valid) + len(errors), valid_count=len(valid), valid=valid, errors=errors)


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: UUID,
    role: str,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(select(User).where(User.id == user_id, User.org_id == org_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found")
    target.role = UserRole(role)
    await db.commit()
    return {"id": str(target.id), "role": role}


# ─── Learner Detail (Admin) ───────────────────────────────────────────────────


@router.get("/users/{user_id}/detail")
async def learner_detail(
    user_id: UUID,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin view of an individual learner — profile, courses, sessions."""
    _require_admin(user)

    # Fetch the target user
    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found")

    # Enrollments with course info
    enrollment_result = await db.execute(
        select(Enrollment, Course)
        .join(Course, Enrollment.course_id == Course.id)
        .where(Enrollment.user_id == user_id)
    )
    enrollments = []
    for enr, course in enrollment_result.all():
        # Count sessions for this course
        session_count = (await db.execute(
            select(func.count(Conversation.id))
            .where(Conversation.user_id == user_id, Conversation.course_id == course.id)
        )).scalar() or 0

        # Get latest session info
        latest_session = (await db.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id, Conversation.course_id == course.id)
            .order_by(Conversation.started_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        enrollments.append({
            "course_id": str(course.id),
            "course_title": course.title,
            "course_description": course.description,
            "thumbnail_url": course.thumbnail_url,
            "mastery_status": enr.mastery_status.value if hasattr(enr.mastery_status, 'value') else str(enr.mastery_status),
            "enrolled_at": enr.enrolled_at.isoformat() if enr.enrolled_at else None,
            "mastery_achieved_at": enr.mastery_achieved_at.isoformat() if enr.mastery_achieved_at else None,
            "session_count": session_count,
            "current_mode": latest_session.session_mode if latest_session else None,
            "last_session_at": latest_session.started_at.isoformat() if latest_session else None,
        })

    # Mastery profile
    profile_result = await db.execute(
        select(MasteryProfile).where(MasteryProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_data = None
    if profile:
        profile_data = {
            "thinking_patterns": profile.thinking_patterns or {},
            "knowledge_graph": profile.knowledge_graph or {},
            "pacing_preferences": profile.pacing_preferences or {},
            "course_progress": profile.course_progress or {},
            "conversation_summary": profile.conversation_summary or [],
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }

    # Session summary stats
    total_sessions = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.user_id == user_id)
    )).scalar() or 0

    total_messages = 0
    sessions_result = await db.execute(
        select(Conversation.messages).where(Conversation.user_id == user_id)
    )
    for (msgs,) in sessions_result.all():
        if msgs:
            total_messages += len(msgs)

    return {
        "id": str(target.id),
        "display_name": target.display_name,
        "email": target.email,
        "role": target.role.value,
        "created_at": target.created_at.isoformat(),
        "enrollments": enrollments,
        "mastery_profile": profile_data,
        "stats": {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "courses_enrolled": len(enrollments),
        },
    }


# ─── Analytics ────────────────────────────────────────────────────────────────


@router.get("/analytics/overview", response_model=AnalyticsOverviewResponse)
async def analytics_overview(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    total_learners = (await db.execute(
        select(func.count(User.id)).where(User.org_id == org_id, User.role == UserRole.learner)
    )).scalar() or 0

    total_categories = (await db.execute(
        select(func.count(Category.id)).where(Category.org_id == org_id)
    )).scalar() or 0

    total_enrollments = (await db.execute(
        select(func.count(Enrollment.id))
        .join(User, Enrollment.user_id == User.id)
        .where(User.org_id == org_id)
    )).scalar() or 0

    # Top categories — deduplicate by name and compute real enrollment counts
    categories_result = await db.execute(select(Category).where(Category.org_id == org_id))
    categories = categories_result.scalars().all()
    seen_names: set[str] = set()
    top_categories = []
    for c in categories:
        if c.name in seen_names:
            continue
        seen_names.add(c.name)
        # Count actual enrollments for courses in this category
        enrolled_count = (await db.execute(
            select(func.count(Enrollment.id))
            .join(Course, Enrollment.course_id == Course.id)
            .where(Course.program_id == c.id)
        )).scalar() or 0
        top_categories.append({
            "name": c.name,
            "enrolled": enrolled_count,
            "avg_progress": round(c.current_level / max(c.target_level, 0.1) * 100),
        })
        if len(top_categories) >= 5:
            break

    return AnalyticsOverviewResponse(
        total_learners=total_learners,
        active_learners=total_learners,
        total_categories=total_categories,
        avg_completion_rate=round(total_enrollments / max(total_learners * total_categories, 1) * 100, 1) if total_categories else 0,
        top_categories=top_categories,
        recent_activity=[],
    )


@router.get("/analytics/courses")
async def course_analytics(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    courses_result = await db.execute(select(Course).where(Course.org_id == org_id))
    courses = courses_result.scalars().all()

    results = []
    for c in courses:
        enrolled = (await db.execute(
            select(func.count(Enrollment.id)).where(Enrollment.course_id == c.id)
        )).scalar() or 0
        results.append({"name": c.title, "enrolled": enrolled, "active": enrolled, "avg_completion": 0.0})
    return results


# ─── Org Settings ─────────────────────────────────────────────────────────────


@router.patch("/org/settings")
async def update_org_settings(
    data: UpdateOrgSettingsRequest,
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organization not found")

    if data.name:
        org.name = data.name
    if data.settings:
        org.settings = {**(org.settings or {}), **data.settings}
    if data.branding:
        current = org.settings or {}
        current["branding"] = data.branding
        org.settings = current

    await db.commit()
    return {"status": "updated"}


# ─── Course Outline Generation ───────────────────────────────────────────────


@router.post("/courses/{course_id}/generate-outline")
async def generate_outline_for_course(
    course_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate or regenerate a course outline from existing content."""
    _require_admin(user)

    course = (await db.execute(
        select(Course).where(Course.id == course_id)
    )).scalar_one_or_none()

    if not course:
        raise HTTPException(404, "Course not found")

    # Get raw text from content embeddings
    result = await db.execute(
        select(ContentEmbedding.chunk_text)
        .where(ContentEmbedding.course_id == course_id)
    )
    chunks = [row[0] for row in result.fetchall()]
    full_text = "\n".join(chunks)

    if not full_text.strip():
        raise HTTPException(400, "No content found for this course. Upload and ingest files first.")

    metadata = course.ai_generated_metadata or {"title": course.title, "description": course.description}

    outline = await generate_course_outline(full_text, metadata)

    from sqlalchemy.orm.attributes import flag_modified
    course.course_outline = outline
    flag_modified(course, "course_outline")
    await db.commit()

    return {"outline": outline, "topic_count": len(outline)}


# ── DATA RESET — Nuclear option for fresh start ──────────────────────────────

@router.delete("/reset-all-data")
async def reset_all_data(
    user: User = Depends(get_current_user),
    org_id: UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL courses, enrollments, conversations, categories, embeddings, files, jobs,
    and mastery profiles for this org. Users and the org itself are preserved.
    This gives a completely clean slate to start fresh."""
    _require_admin(user)

    # Get all user IDs in this org (to clean mastery profiles)
    org_user_ids = (await db.execute(
        select(User.id).where(User.org_id == org_id)
    )).scalars().all()

    # Get all course IDs in this org
    org_course_ids = (await db.execute(
        select(Course.id).where(Course.org_id == org_id)
    )).scalars().all()

    # Get all category IDs in this org
    org_category_ids = (await db.execute(
        select(Category.id).where(Category.org_id == org_id)
    )).scalars().all()

    # Get domain IDs for cascade
    org_domain_ids = (await db.execute(
        select(Domain.id).where(Domain.program_id.in_(org_category_ids))
    )).scalars().all() if org_category_ids else []

    deleted = {}

    # 1. Conversations (depends on course + user)
    r = await db.execute(delete(Conversation).where(Conversation.course_id.in_(org_course_ids))) if org_course_ids else None
    deleted["conversations"] = r.rowcount if r else 0

    # 2. Enrollments (depends on course + user)
    r = await db.execute(delete(Enrollment).where(Enrollment.course_id.in_(org_course_ids))) if org_course_ids else None
    deleted["enrollments"] = r.rowcount if r else 0

    # 3. Content embeddings (depends on course)
    r = await db.execute(delete(ContentEmbedding).where(ContentEmbedding.course_id.in_(org_course_ids))) if org_course_ids else None
    deleted["content_embeddings"] = r.rowcount if r else 0

    # 4. Course files
    r = await db.execute(delete(CourseFile).where(CourseFile.org_id == org_id))
    deleted["course_files"] = r.rowcount

    # 5. Ingestion jobs
    r = await db.execute(delete(IngestionJob).where(IngestionJob.org_id == org_id))
    deleted["ingestion_jobs"] = r.rowcount

    # 6. Capabilities (depends on domain)
    r = await db.execute(delete(Capability).where(Capability.domain_id.in_(org_domain_ids))) if org_domain_ids else None
    deleted["capabilities"] = r.rowcount if r else 0

    # 7. Domains (depends on category)
    r = await db.execute(delete(Domain).where(Domain.program_id.in_(org_category_ids))) if org_category_ids else None
    deleted["domains"] = r.rowcount if r else 0

    # 8. Milestones (depends on category)
    r = await db.execute(delete(Milestone).where(Milestone.program_id.in_(org_category_ids))) if org_category_ids else None
    deleted["milestones"] = r.rowcount if r else 0

    # 9. Focus sessions (depends on category)
    r = await db.execute(delete(FocusSession).where(FocusSession.program_id.in_(org_category_ids))) if org_category_ids else None
    deleted["focus_sessions"] = r.rowcount if r else 0

    # 10. Courses (set program_id to null first to avoid FK issues, then delete)
    if org_course_ids:
        await db.execute(update(Course).where(Course.id.in_(org_course_ids)).values(program_id=None))
        r = await db.execute(delete(Course).where(Course.id.in_(org_course_ids)))
        deleted["courses"] = r.rowcount
    else:
        deleted["courses"] = 0

    # 11. Categories (programs)
    r = await db.execute(delete(Category).where(Category.org_id == org_id))
    deleted["categories"] = r.rowcount

    # 12. Mastery profiles (depends on user)
    r = await db.execute(delete(MasteryProfile).where(MasteryProfile.user_id.in_(org_user_ids))) if org_user_ids else None
    deleted["mastery_profiles"] = r.rowcount if r else 0

    await db.commit()

    return {
        "status": "success",
        "message": "All course data wiped. You can now start fresh.",
        "deleted": deleted,
    }
