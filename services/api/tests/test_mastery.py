import pytest


@pytest.mark.asyncio
async def test_learner_can_read_own_profile(learner_client):
    response = await learner_client.get("/api/mastery/me/profile")
    assert response.status_code == 200
    data = response.json()
    assert data["thinking_patterns"]["style"] == "analytical"
    assert "mastered" in data["knowledge_graph"]


@pytest.mark.asyncio
async def test_learner_can_read_own_enrollments(learner_client):
    response = await learner_client.get("/api/mastery/enrollments/me")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
