"""
CRITICAL PRIVACY TESTS
Verify that org_admin CANNOT access learner mastery profiles.
"""

import pytest
from tests.conftest import LEARNER_ID


@pytest.mark.asyncio
async def test_admin_cannot_access_learner_mastery_profile(admin_client):
    """Org admin must get 403 when requesting a learner's mastery profile."""
    response = await admin_client.get(f"/api/mastery/{LEARNER_ID}/profile")
    assert response.status_code == 403
    assert "private" in response.json()["detail"].lower() or "denied" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_cannot_access_own_nonexistent_profile(admin_client):
    """Admin requesting their own profile (which doesn't exist) should get 404, not profile data."""
    from tests.conftest import ADMIN_ID
    response = await admin_client.get(f"/api/mastery/{ADMIN_ID}/profile")
    # Admin can access their own profile endpoint, but they don't have one
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_can_see_enrollment_statuses(admin_client):
    """Org admin CAN see enrollment statuses (binary mastery outcome)."""
    response = await admin_client.get("/api/mastery/enrollments/org")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    # Verify no mastery profile details leak through
    for enrollment in data:
        assert "thinking_patterns" not in enrollment
        assert "knowledge_graph" not in enrollment
        assert "conversation_summary" not in enrollment


@pytest.mark.asyncio
async def test_admin_can_see_enrollment_count(admin_client):
    """Org admin CAN see aggregate enrollment count."""
    response = await admin_client.get("/api/mastery/enrollments/org/count")
    assert response.status_code == 200
    assert response.json()["enrollment_count"] >= 2


@pytest.mark.asyncio
async def test_learner_cannot_see_org_enrollments(learner_client):
    """Learner cannot access org-wide enrollment data."""
    response = await learner_client.get("/api/mastery/enrollments/org")
    assert response.status_code == 403
