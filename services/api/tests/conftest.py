import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base, get_db
from app.core.security import verify_token
from app.main import app
from app.models.organization import Organization, PlanTier
from app.models.user import User, UserRole
from app.models.course import Course, CourseType, CourseStatus
from app.models.mastery_profile import MasteryProfile
from app.models.enrollment import Enrollment, MasteryStatus

TEST_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery_test"

# Fixed UUIDs for deterministic testing
ORG_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
ADMIN_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
LEARNER_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
COURSE1_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
COURSE2_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")
PROFILE_ID = uuid.UUID("66666666-6666-6666-6666-666666666666")

ADMIN_AUTH0_SUB = "auth0|admin_test_sub"
LEARNER_AUTH0_SUB = "auth0|learner_test_sub"


def mock_admin_token():
    async def _verify(credentials=None):
        return {"sub": ADMIN_AUTH0_SUB, "permissions": []}
    return _verify


def mock_learner_token():
    async def _verify(credentials=None):
        return {"sub": LEARNER_AUTH0_SUB, "permissions": []}
    return _verify


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # Seed test data
        org = Organization(id=ORG_ID, name="Test Org", slug="test-org", plan_tier=PlanTier.starter)
        session.add(org)

        admin = User(
            id=ADMIN_ID, email="admin@test.com", display_name="Test Admin",
            role=UserRole.org_admin, org_id=ORG_ID, auth0_sub=ADMIN_AUTH0_SUB,
        )
        session.add(admin)

        learner = User(
            id=LEARNER_ID, email="learner@test.com", display_name="Test Learner",
            role=UserRole.learner, org_id=ORG_ID, auth0_sub=LEARNER_AUTH0_SUB,
        )
        session.add(learner)

        course1 = Course(
            id=COURSE1_ID, org_id=ORG_ID, title="Test Course 1",
            description="Test desc 1", type=CourseType.preloaded, status=CourseStatus.active,
        )
        session.add(course1)

        course2 = Course(
            id=COURSE2_ID, org_id=ORG_ID, title="Test Course 2",
            description="Test desc 2", type=CourseType.custom, status=CourseStatus.draft,
        )
        session.add(course2)

        profile = MasteryProfile(
            id=PROFILE_ID, user_id=LEARNER_ID,
            thinking_patterns={"style": "analytical"},
            knowledge_graph={"mastered": ["basics"]},
        )
        session.add(profile)

        enrollment1 = Enrollment(
            id=uuid.uuid4(), user_id=LEARNER_ID, course_id=COURSE1_ID,
            mastery_status=MasteryStatus.in_progress,
        )
        session.add(enrollment1)

        enrollment2 = Enrollment(
            id=uuid.uuid4(), user_id=LEARNER_ID, course_id=COURSE2_ID,
            mastery_status=MasteryStatus.not_started,
        )
        session.add(enrollment2)

        await session.commit()

    yield session_factory


@pytest_asyncio.fixture
async def learner_client(db_session):
    async def override_get_db():
        async with db_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[verify_token] = mock_learner_token()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_client(db_session):
    async def override_get_db():
        async with db_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[verify_token] = mock_admin_token()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def unauthenticated_client(db_session):
    async def override_get_db():
        async with db_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    # No token override — will use real verify_token which will fail
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
