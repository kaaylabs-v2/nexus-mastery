import pytest


@pytest.mark.asyncio
async def test_get_me_as_learner(learner_client):
    response = await learner_client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "learner@test.com"
    assert data["role"] == "learner"


@pytest.mark.asyncio
async def test_get_me_as_admin(admin_client):
    response = await admin_client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@test.com"
    assert data["role"] == "org_admin"


@pytest.mark.asyncio
async def test_unauthenticated_gets_401(unauthenticated_client):
    response = await unauthenticated_client.get("/api/auth/me")
    assert response.status_code in (401, 403)
