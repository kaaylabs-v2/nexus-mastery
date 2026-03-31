"""Tests for the Nexi engine prompt assembly and model routing."""

import pytest
from app.services.nexi_engine import (
    _build_messages,
    _select_model,
    SOCRATIC_SYSTEM_PROMPT,
)


def test_select_model_complex_session():
    assert _select_model("assessment") == "claude-sonnet-4-20250514"
    assert _select_model("mastery_verification") == "claude-sonnet-4-20250514"


def test_select_model_simple_session():
    assert _select_model("guided_learning") == "claude-haiku-4-5-20251001"
    assert _select_model("practice") == "claude-haiku-4-5-20251001"
    assert _select_model("clarification") == "claude-haiku-4-5-20251001"


def test_build_messages_includes_system_prompt():
    system, messages = _build_messages(
        conversation_history=[{"role": "user", "content": "Hello"}],
        mastery_profile=None,
        course_chunks=[],
        session_mode="clarify",
    )
    assert "Nexi" in system
    assert "Socratic" in system
    assert "CLARIFY" in system


def test_build_messages_includes_mastery_profile():
    profile = {
        "thinking_patterns": {"style": "analytical"},
        "knowledge_graph": {"mastered": ["basics"]},
        "pacing_preferences": {"optimal_session_length": 25},
    }
    system, messages = _build_messages(
        conversation_history=[],
        mastery_profile=profile,
        course_chunks=[],
        session_mode="challenge",
    )
    assert "LEARNER CONTEXT" in system
    assert "analytical" in system
    assert "CHALLENGE" in system


def test_build_messages_includes_course_chunks():
    chunks = ["Decision matrices help prioritize...", "SWOT analysis considers..."]
    system, messages = _build_messages(
        conversation_history=[],
        mastery_profile=None,
        course_chunks=chunks,
        session_mode="alternatives",
    )
    assert "RELEVANT COURSE CONTENT" in system
    assert "Decision matrices" in system
    assert "SWOT" in system


def test_build_messages_formats_conversation_history():
    history = [
        {"role": "user", "content": "What is a decision matrix?"},
        {"role": "assistant", "content": "What do you think it might be?"},
        {"role": "user", "content": "A tool for comparing options?"},
    ]
    system, messages = _build_messages(
        conversation_history=history,
        mastery_profile=None,
        course_chunks=[],
        session_mode="clarify",
    )
    assert len(messages) == 3
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[2]["role"] == "user"


def test_build_messages_all_context_layers():
    """Verify all context layers are present when all inputs provided."""
    profile = {"thinking_patterns": {"style": "visual"}}
    chunks = ["Content chunk 1"]
    history = [{"role": "user", "content": "Hi"}]

    system, messages = _build_messages(
        conversation_history=history,
        mastery_profile=profile,
        course_chunks=chunks,
        session_mode="show_your_work",
    )

    # All layers present
    assert "Nexi" in system  # Base system prompt
    assert "SHOW_YOUR_WORK" in system  # Session mode
    assert "LEARNER CONTEXT" in system  # Mastery profile
    assert "RELEVANT COURSE CONTENT" in system  # RAG chunks
    assert len(messages) == 1  # Conversation history
