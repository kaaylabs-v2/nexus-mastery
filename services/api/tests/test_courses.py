import pytest
from tests.conftest import ORG_ID, COURSE1_ID


@pytest.mark.asyncio
async def test_list_courses(learner_client):
    response = await learner_client.get("/api/courses")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_course(learner_client):
    response = await learner_client.get(f"/api/courses/{COURSE1_ID}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Course 1"


@pytest.mark.asyncio
async def test_create_course_as_admin(admin_client):
    response = await admin_client.post("/api/courses", json={
        "title": "New Course",
        "description": "A new test course",
        "org_id": str(ORG_ID),
        "type": "custom",
        "status": "draft",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "New Course"


@pytest.mark.asyncio
async def test_create_course_as_learner_forbidden(learner_client):
    response = await learner_client.post("/api/courses", json={
        "title": "Sneaky Course",
        "org_id": str(ORG_ID),
    })
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_course(admin_client):
    response = await admin_client.put(f"/api/courses/{COURSE1_ID}", json={
        "title": "Updated Course Title",
    })
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Course Title"


@pytest.mark.asyncio
async def test_delete_course(admin_client):
    response = await admin_client.delete(f"/api/courses/{COURSE1_ID}")
    assert response.status_code == 204
