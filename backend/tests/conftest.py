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

import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

# ══════════════════════════════════════════════════════════════════
# Model import workaround — prevent double table registration
# ══════════════════════════════════════════════════════════════════
#
# Production code imports models via ``app.models.__init__`` →
# ``app.models.models`` (a single-file definition).  Individual files
# (user.py, course.py, …) redundantly define the SAME model classes.
# Importing any of them would cause SQLAlchemy "Table already defined"
# errors on the shared MetaData.
#
# Strategy: import from the canonical single-file source, then
# pre-register fake modules so the duplicate files are never loaded.
# ══════════════════════════════════════════════════════════════════

# 1 ─ Import from the canonical single-file source (table registration once)
from app.models.models import (  # noqa: E402
    AuditLog,
    Chunk,
    Course,
    Document,
    Feedback,
    QAHistory,
    RefreshToken,
    User,
)
from app.models.user_session import UserSession  # noqa: E402

# 2 ─ Pre-register fake modules so the individual per-model files
#     are never loaded (``test_auth.py`` imports ``from app.models.user import User``)
_MODEL_FILES = (
    "user",
    "document",
    "qa_history",
    "feedback",
    "course",
    "chunk",
    "audit_log",
    "refresh_token",
)
for _name in _MODEL_FILES:
    _mod = types.ModuleType(f"app.models.{_name}")
    sys.modules[f"app.models.{_name}"] = _mod

# 3 ─ Re-export model classes on the fake modules
sys.modules["app.models.user"].User = User
sys.modules["app.models.document"].Document = Document
sys.modules["app.models.qa_history"].QAHistory = QAHistory
sys.modules["app.models.feedback"].Feedback = Feedback
sys.modules["app.models.course"].Course = Course
sys.modules["app.models.chunk"].Chunk = Chunk
sys.modules["app.models.audit_log"].AuditLog = AuditLog
sys.modules["app.models.refresh_token"].RefreshToken = RefreshToken

# 4 ─ APIResponse workaround: auth.py imports it from app.schemas.user
#     but it is actually defined in app.schemas.common.
import app.schemas.user as _user_schemas  # noqa: E402
from app.schemas.common import APIResponse as _APIResponse  # noqa: E402

_user_schemas.APIResponse = _APIResponse

# 5 ─ Now safe to import the FastAPI app
from main import app  # noqa: E402

# ══════════════════════════════════════════════════════════════════
# Real-DB fixtures (pytest-asyncio, auto mode)
# ══════════════════════════════════════════════════════════════════
from tests.fixtures.db import init_test_data, reset_db, test_db  # noqa: E402
from tests.fixtures.client import async_client  # noqa: E402
from tests.fixtures import create_test_user  # noqa: E402

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
