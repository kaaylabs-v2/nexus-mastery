import pytest
from tests.conftest import COURSE1_ID


@pytest.mark.asyncio
async def test_create_conversation(learner_client):
    response = await learner_client.post("/api/conversations", json={
        "course_id": str(COURSE1_ID),
        "session_type": "guided_learning",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["course_id"] == str(COURSE1_ID)
    assert data["session_type"] == "guided_learning"
    assert data["session_mode"] == "clarify"
    assert data["messages"] == []


@pytest.mark.asyncio
async def test_list_conversations(learner_client):
    # Create one first
    await learner_client.post("/api/conversations", json={
        "course_id": str(COURSE1_ID),
    })
    response = await learner_client.get("/api/conversations")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_add_message_to_conversation(learner_client):
    # Create conversation
    create_resp = await learner_client.post("/api/conversations", json={
        "course_id": str(COURSE1_ID),
    })
    conv_id = create_resp.json()["id"]

    # Add message
    response = await learner_client.post(f"/api/conversations/{conv_id}/messages", json={
        "content": "Hello, I'm ready to learn about decision making.",
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 1
    assert data["messages"][0]["role"] == "user"
    assert "decision making" in data["messages"][0]["content"]


@pytest.mark.asyncio
async def test_get_conversation(learner_client):
    create_resp = await learner_client.post("/api/conversations", json={
        "course_id": str(COURSE1_ID),
    })
    conv_id = create_resp.json()["id"]

    response = await learner_client.get(f"/api/conversations/{conv_id}")
    assert response.status_code == 200
    assert response.json()["id"] == conv_id
