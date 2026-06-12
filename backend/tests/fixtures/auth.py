"""Authentication-related test fixtures.

Provides ready-to-use JWT tokens and auth headers for integration tests.
All token-returning fixtures create real User records in the transactional
test database (except ``expired_token``, which is a pure JWT construction).

Fixtures:
    student_token         - JWT access_token for a student user
    teacher_token         - JWT access_token for a teacher user
    admin_token           - JWT access_token for an admin user
    auth_headers          - {"Authorization": "Bearer {student_token}"} dict
    expired_token         - Expired JWT access token (no DB needed)
    refresh_token_str     - JWT refresh_token for a student user
    disabled_user_token   - JWT access_token for a disabled (is_active=False) user
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from jose import jwt

from app.core.config import settings


# ── Convenience helpers ────────────────────────────────────────────


async def _create_user_and_token(test_db, *, role, username, password="pass123", is_active=True):
    """Create a real User row and return a JWT access_token string."""
    from app.core.security import create_access_token, hash_password
    from app.models.user import User

    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        real_name=f"Test {role}",
        email=f"{username}@test.local",
        is_active=is_active,
    )
    test_db.add(user)
    await test_db.flush()

    return create_access_token({"sub": str(user.id), "role": user.role})


# ── Token fixtures ─────────────────────────────────────────────────


@pytest_asyncio.fixture
async def student_token(test_db):
    """JWT access_token for a student user (real DB record).

    Usage::

        async def test_student(student_token):
            headers = {"Authorization": f"Bearer {student_token}"}
            ...
    """
    return await _create_user_and_token(test_db, role="student", username="test_student")


@pytest_asyncio.fixture
async def teacher_token(test_db):
    """JWT access_token for a teacher user (real DB record)."""
    return await _create_user_and_token(test_db, role="teacher", username="test_teacher")


@pytest_asyncio.fixture
async def admin_token(test_db):
    """JWT access_token for an admin user (real DB record)."""
    return await _create_user_and_token(test_db, role="admin", username="test_admin")


@pytest_asyncio.fixture
async def disabled_user_token(test_db):
    """JWT access_token for a user with ``is_active=False``.

    The token itself is structurally valid — the *user record*
    in the database has ``is_active=False``, so ``get_current_user``
    will raise HTTP 403 when the dependency is used.
    """
    return await _create_user_and_token(
        test_db, role="student", username="test_disabled", is_active=False
    )


# ── Auth headers ───────────────────────────────────────────────────


@pytest.fixture
def auth_headers(student_token):
    """Returns a pre-built ``Authorization`` header dict for the student token.

    Usage::

        async def test_me(auth_headers, async_client):
            resp = await async_client.get("/api/v1/auth/me", headers=auth_headers)
            assert resp.status_code == 200
    """
    return {"Authorization": f"Bearer {student_token}"}


# ── Expired token (no DB) ──────────────────────────────────────────


@pytest.fixture
def expired_token():
    """Return an expired JWT access token — no database interaction.

    The token has ``exp`` set to 1 hour in the past, so ``decode_token``
    returns ``None`` and any ``get_current_user``-protected endpoint
    returns 401.
    """
    expire = datetime.now(timezone.utc) - timedelta(hours=1)
    payload = {
        "sub": "0",
        "role": "student",
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── Refresh token ──────────────────────────────────────────────────


@pytest_asyncio.fixture
async def refresh_token_str(test_db):
    """JWT refresh_token string for a student user (real DB record).

    The token has ``type: "refresh"`` and a 7-day expiry.
    """
    from app.core.security import create_refresh_token, hash_password
    from app.models.user import User

    user = User(
        username="test_student2",
        password_hash=hash_password("pass123"),
        role="student",
        real_name="Test student",
        email="test_student2@test.local",
    )
    test_db.add(user)
    await test_db.flush()

    return create_refresh_token({"sub": str(user.id), "role": user.role})
