"""Real database fixtures for integration tests.

Provides transactional test database access using the
application's own AsyncSessionLocal, with automatic
rollback on teardown for test isolation.
"""

import pytest_asyncio


@pytest_asyncio.fixture
async def test_db():
    """Real PostgreSQL connection with transaction rollback per test.

    Creates an AsyncSession from the application's sessionmaker,
    begins a transaction, yields the session for test use,
    then rolls back on teardown so no data persists.

    Usage::

        async def test_something(test_db):
            result = await test_db.execute(...)
    """
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        await session.begin()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def reset_db():
    """Clean test data marker fixture.

    In the transactional test pattern (test_db), each test is
    isolated by automatic rollback. Use this fixture alongside
    test_db when you need explicit cleanup semantics.

    Usage::

        async def test_something(test_db, reset_db):
            ...
    """
    yield


@pytest_asyncio.fixture
async def init_test_data(test_db):
    """Seed minimal test data: admin user + a course.

    Creates:
        - admin user (role=admin, username=admin001)
        - test course (bound to admin)

    Returns:
        dict: {"admin": User, "course": Course}

    Usage::

        async def test_course(test_db, init_test_data):
            admin = init_test_data["admin"]
            course = init_test_data["course"]
    """
    from app.core.security import hash_password
    from app.models.course import Course
    from app.models.user import User

    admin = User(
        username="admin001",
        password_hash=hash_password("Admin@123"),
        role="admin",
        real_name="管理员",
        email="admin@eduraq.test",
    )
    test_db.add(admin)
    await test_db.flush()

    course = Course(
        name="测试课程",
        semester="2025-2026-2",
        teacher_id=admin.id,
        description="用于测试的课程",
    )
    test_db.add(course)
    await test_db.flush()

    await test_db.refresh(admin)
    await test_db.refresh(course)

    return {"admin": admin, "course": course}
