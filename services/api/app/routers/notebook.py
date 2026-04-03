"""Notebook & Vocabulary endpoints for the learner workspace."""

import json
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import anthropic

from app.core.database import get_db
from app.core.config import get_settings
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.notebook import NotebookEntry, VocabularyEntry

router = APIRouter(prefix="/api/notebook", tags=["notebook"])
settings = get_settings()


# ── Pydantic Models ──────────────────────────────────────────────────────────


class NoteCreate(BaseModel):
    title: str
    content: str
    course_id: str | None = None
    tags: list[str] = []
    source: str = "personal"
    source_message_id: str | None = None


class VocabCreate(BaseModel):
    term: str
    definition: str
    example: str | None = None
    course_id: str | None = None
    tags: list[str] = []


class GenerateRequest(BaseModel):
    term: str
    course_context: str | None = None


# ── Notes CRUD ───────────────────────────────────────────────────────────────


@router.get("/notes")
async def list_notes(
    course_id: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(NotebookEntry).where(NotebookEntry.user_id == user.id)
    if course_id:
        query = query.where(NotebookEntry.course_id == course_id)
    query = query.order_by(NotebookEntry.created_at.desc()).limit(100)
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "title": e.title,
            "content": e.content,
            "course_id": str(e.course_id) if e.course_id else None,
            "tags": e.tags or [],
            "source": e.source,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in entries
    ]


@router.post("/notes", status_code=201)
async def create_note(
    note: NoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = NotebookEntry(
        user_id=user.id,
        course_id=UUID(note.course_id) if note.course_id else None,
        title=note.title[:500],
        content=note.content[:10000],
        tags=note.tags[:20],
        source=note.source,
        source_message_id=note.source_message_id,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return {
        "id": str(entry.id),
        "title": entry.title,
        "content": entry.content,
        "course_id": str(entry.course_id) if entry.course_id else None,
        "tags": entry.tags or [],
        "source": entry.source,
        "created_at": entry.created_at.isoformat() if entry.created_at else "",
    }


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotebookEntry).where(NotebookEntry.id == note_id, NotebookEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Note not found")
    await db.delete(entry)
    await db.commit()


# ── Vocabulary CRUD ──────────────────────────────────────────────────────────


@router.get("/vocab")
async def list_vocab(
    course_id: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(VocabularyEntry).where(VocabularyEntry.user_id == user.id)
    if course_id:
        query = query.where(VocabularyEntry.course_id == course_id)
    query = query.order_by(VocabularyEntry.created_at.desc()).limit(200)
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "term": e.term,
            "definition": e.definition,
            "example": e.example,
            "course_id": str(e.course_id) if e.course_id else None,
            "tags": e.tags or [],
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in entries
    ]


@router.post("/vocab", status_code=201)
async def create_vocab(
    vocab: VocabCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = VocabularyEntry(
        user_id=user.id,
        course_id=UUID(vocab.course_id) if vocab.course_id else None,
        term=vocab.term[:500],
        definition=vocab.definition[:5000],
        example=vocab.example[:2000] if vocab.example else None,
        tags=vocab.tags[:20],
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return {
        "id": str(entry.id),
        "term": entry.term,
        "definition": entry.definition,
        "example": entry.example,
        "course_id": str(entry.course_id) if entry.course_id else None,
        "tags": entry.tags or [],
        "created_at": entry.created_at.isoformat() if entry.created_at else "",
    }


@router.delete("/vocab/{vocab_id}", status_code=204)
async def delete_vocab(
    vocab_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VocabularyEntry).where(VocabularyEntry.id == vocab_id, VocabularyEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Vocab entry not found")
    await db.delete(entry)
    await db.commit()


# ── AI Generation ────────────────────────────────────────────────────────────


@router.post("/vocab/generate-definition")
async def generate_definition(
    req: GenerateRequest,
    user: User = Depends(get_current_user),
):
    """Use Claude Haiku to generate a definition for a term."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    context = f" in the context of {req.course_context}" if req.course_context else ""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": f"Define the term '{req.term}'{context}. Give a clear, concise definition (2-3 sentences) suitable for a student. Return ONLY the definition text, no prefix.",
        }],
    )
    definition = response.content[0].text.strip()
    return {"term": req.term, "definition": definition}


@router.post("/vocab/generate-example")
async def generate_example(
    req: GenerateRequest,
    user: User = Depends(get_current_user),
):
    """Use Claude Haiku to generate a usage example for a term."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    context = f" in the context of {req.course_context}" if req.course_context else ""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"Give a practical example of '{req.term}'{context}. One clear sentence showing how it's used. Return ONLY the example.",
        }],
    )
    example = response.content[0].text.strip()
    return {"term": req.term, "example": example}
