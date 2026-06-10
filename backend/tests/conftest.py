"""Shared test fixtures for EduRAG backend tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

# Workaround: APIResponse is defined in app.schemas.common but auth.py imports
# it from app.schemas.user. Inject it before importing main so the import chain
# resolves correctly.
import app.schemas.user as _user_schemas
from app.schemas.common import APIResponse as _APIResponse

_user_schemas.APIResponse = _APIResponse

# Import ALL model modules so SQLAlchemy's declarative registry knows about
# every mapped class. User has relationships to Document, QAHistory, Feedback
# which must be registered before User is instantiated.
from app.models import user as _user_model
from app.models import document as _document_model
from app.models import qa_history as _qa_history_model
from app.models import feedback as _feedback_model
from app.models import course as _course_model
from app.models import chunk as _chunk_model
from app.models import audit_log as _audit_log_model
from app.models import refresh_token as _refresh_token_model

from main import app
from app.models.user import User


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
