"""Shared test fixtures for EduRAG backend tests.

Mock fixtures (backward compatible):
    client          - FastAPI TestClient with dependency override support
    mock_db_session - Mock AsyncSession with column default simulation
    valid_user_data - Sample registration credentials
    create_mock_user - Factory for mock User objects
    make_execute_return - Helper to configure mock execute() returns

Real DB fixtures (new):
    test_db         - Real PostgreSQL session with transaction rollback
    async_client    - httpx.AsyncClient against FastAPI ASGI app
    reset_db        - Clean test data marker
    init_test_data  - Seed admin user + course
    create_test_user - Factory for real User + JWT token
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, MagicMock

from app.models.models import (
    AuditLog,
    Chunk,
    Course,
    Document,
    Feedback,
    QAHistory,
    RefreshToken,
    User,
)
from app.models.user_session import UserSession

from main import app

# ══════════════════════════════════════════════════════════════════
# Real-DB fixtures (pytest-asyncio, auto mode)
# ══════════════════════════════════════════════════════════════════
from tests.fixtures.db import init_test_data, reset_db, test_db  # noqa: E402
from tests.fixtures.client import async_client  # noqa: E402
from tests.fixtures import create_test_user  # noqa: E402
from tests.fixtures.auth import (  # noqa: E402
    admin_token,
    auth_headers,
    disabled_user_token,
    expired_token,
    refresh_token_str,
    student_token,
    teacher_token,
)
from tests.fixtures.documents import (  # noqa: E402
    approved_document,
    processed_document,
    sample_docx_file,
    sample_large_file,
    sample_pdf_file,
    sample_txt_file,
    sample_unsupported_file,
    uploaded_document,
)

# ══════════════════════════════════════════════════════════════════
# Mock fixtures (kept for backward compatibility)
# ══════════════════════════════════════════════════════════════════


@pytest.fixture
def client():
    """FastAPI TestClient with clean dependency overrides per test."""
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db_session():
    """Mock AsyncSession — no real database needed.

    The ``refresh`` mock populates SQLAlchemy column defaults on the
    instance (force_password_change, is_active, id, created_at) so that
    Pydantic validation passes after the mocked flush+refresh in endpoints.
    """
    session = AsyncMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.close = AsyncMock()

    async def _mock_refresh(instance, attribute_names=None):
        """Simulate DB refresh: fill in column defaults that the DB would set."""
        if hasattr(instance, "id") and instance.id is None:
            instance.id = 1
        if hasattr(instance, "force_password_change") and instance.force_password_change is None:
            instance.force_password_change = False
        if hasattr(instance, "is_active") and instance.is_active is None:
            instance.is_active = True
        if hasattr(instance, "real_name") and instance.real_name is None:
            instance.real_name = ""
        if hasattr(instance, "created_at") and instance.created_at is None:
            instance.created_at = "2024-01-01T00:00:00"

    session.refresh = AsyncMock(side_effect=_mock_refresh)
    return session


@pytest.fixture
def valid_user_data():
    """Valid test user credentials."""
    return {
        "username": "test001",
        "password": "Test@123456",
    }


def create_mock_user(
    id=1,
    username="test001",
    role="student",
    is_active=True,
    force_password_change=False,
    real_name="测试用户",
    email="test@example.com",
    created_at="2024-01-01T00:00:00",
    password_hash=None,
):
    """Factory: create a mock User with configurable attributes.

    Set password_hash to a real bcrypt hash if you want verify_password
    to work without mocking. Otherwise it defaults to a dummy string.
    """
    user = MagicMock(spec=User)
    user.id = id
    user.username = username
    user.role = role
    user.is_active = is_active
    user.force_password_change = force_password_change
    user.real_name = real_name
    user.email = email
    user.created_at = created_at
    user.password_hash = password_hash or "dummy_hashed_password"
    return user


def make_execute_return(mock_db, return_value):
    """Helper: configure mock_db.execute() to return a result whose
    scalar_one_or_none() returns *return_value*."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = return_value
    mock_db.execute.return_value = mock_result
