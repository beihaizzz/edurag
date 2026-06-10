"""API tests for app.api.v1.auth — FastAPI TestClient with mocked DB.

All auth endpoints return HTTP 200 with APIResponse body.
Success: code=0. Errors: code=4xxxx.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import get_db
from app.core.security import hash_password
from app.deps import get_current_user
from app.models.user import User

from .conftest import create_mock_user, make_execute_return


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════

def _override_db(mock_session):
    """Override get_db dependency to return the mock session."""
    app.dependency_overrides[get_db] = lambda: mock_session


def _override_current_user(mock_user):
    """Override get_current_user to return a mock user directly."""
    app.dependency_overrides[get_current_user] = lambda: mock_user


# ═══════════════════════════════════════════════════════════════════
# POST /api/v1/auth/register
# ═══════════════════════════════════════════════════════════════════

class TestRegister:
    """Tests for POST /api/v1/auth/register."""

    def test_register_success(self, client, mock_db_session, valid_user_data):
        """Happy path: new user registers successfully."""
        _override_db(mock_db_session)
        make_execute_return(mock_db_session, None)  # no existing user

        response = client.post("/api/v1/auth/register", json=valid_user_data)

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        assert body["message"] == "注册成功"
        assert body["data"]["user"]["username"] == valid_user_data["username"]
        assert body["data"]["user"]["role"] == "student"
        # Verify db.add was called
        mock_db_session.add.assert_called_once()
        mock_db_session.flush.assert_awaited_once()
        mock_db_session.refresh.assert_awaited_once()

    def test_register_duplicate_username(self, client, mock_db_session, valid_user_data):
        """Duplicate username returns code=40001."""
        _override_db(mock_db_session)
        existing_user = create_mock_user(username=valid_user_data["username"])
        make_execute_return(mock_db_session, existing_user)

        response = client.post("/api/v1/auth/register", json=valid_user_data)

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40001
        assert "已存在" in body["message"]
        # db.add should NOT be called for duplicates
        mock_db_session.add.assert_not_called()

    def test_register_short_password(self, client, mock_db_session):
        """Password shorter than 6 chars → Pydantic 422 validation error."""
        _override_db(mock_db_session)
        payload = {"username": "test001", "password": "12345"}

        response = client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 422

    def test_register_empty_username(self, client, mock_db_session):
        """Empty username → Pydantic 422 validation error."""
        _override_db(mock_db_session)
        payload = {"username": "", "password": "Password123"}

        response = client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 422

    def test_register_missing_fields(self, client, mock_db_session):
        """Missing required fields → 422."""
        _override_db(mock_db_session)
        response = client.post("/api/v1/auth/register", json={})
        assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════
# POST /api/v1/auth/login
# ═══════════════════════════════════════════════════════════════════

class TestLogin:
    """Tests for POST /api/v1/auth/login."""

    @pytest.fixture
    def login_payload(self, valid_user_data):
        return {
            "username": valid_user_data["username"],
            "password": valid_user_data["password"],
        }

    def test_login_success(self, client, mock_db_session, valid_user_data, login_payload):
        """Happy path: correct credentials return tokens."""
        _override_db(mock_db_session)
        # Create mock user with a real bcrypt hash so verify_password works
        real_hash = hash_password(valid_user_data["password"])
        mock_user = create_mock_user(
            username=valid_user_data["username"], password_hash=real_hash
        )
        make_execute_return(mock_db_session, mock_user)

        response = client.post("/api/v1/auth/login", json=login_payload)

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        data = body["data"]
        assert len(data["access_token"]) > 0
        assert len(data["refresh_token"]) > 0
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 60 * 60  # ACCESS_TOKEN_EXPIRE_MINUTES * 60
        assert data["user"]["username"] == valid_user_data["username"]
        assert data["user"]["role"] == "student"

    def test_login_wrong_password(self, client, mock_db_session, valid_user_data):
        """Wrong password → code=40002."""
        _override_db(mock_db_session)
        real_hash = hash_password(valid_user_data["password"])
        mock_user = create_mock_user(
            username=valid_user_data["username"], password_hash=real_hash
        )
        make_execute_return(mock_db_session, mock_user)

        response = client.post(
            "/api/v1/auth/login",
            json={"username": valid_user_data["username"], "password": "WrongPass1"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40002
        assert "错误" in body["message"]

    def test_login_nonexistent_user(self, client, mock_db_session, valid_user_data):
        """Non-existent user → code=40002 (same as wrong password)."""
        _override_db(mock_db_session)
        make_execute_return(mock_db_session, None)

        response = client.post(
            "/api/v1/auth/login",
            json={"username": "ghost_user", "password": "Anything1"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40002

    def test_login_disabled_account(self, client, mock_db_session, valid_user_data):
        """Disabled account → code=40003."""
        _override_db(mock_db_session)
        real_hash = hash_password(valid_user_data["password"])
        mock_user = create_mock_user(
            username=valid_user_data["username"],
            password_hash=real_hash,
            is_active=False,
        )
        make_execute_return(mock_db_session, mock_user)

        response = client.post(
            "/api/v1/auth/login",
            json={"username": valid_user_data["username"], "password": valid_user_data["password"]},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40003
        assert "禁用" in body["message"]

    def test_login_missing_credentials(self, client, mock_db_session):
        """Missing username or password → 422."""
        _override_db(mock_db_session)
        response = client.post("/api/v1/auth/login", json={})
        assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════
# POST /api/v1/auth/refresh
# ═══════════════════════════════════════════════════════════════════

class TestRefresh:
    """Tests for POST /api/v1/auth/refresh."""

    def _mock_decode(self, payload):
        """Return a patcher for app.api.v1.auth.decode_token."""
        return patch("app.api.v1.auth.decode_token", return_value=payload)

    def test_refresh_success(self, client, mock_db_session):
        """Valid refresh token returns new token pair."""
        _override_db(mock_db_session)
        mock_user = create_mock_user()
        make_execute_return(mock_db_session, mock_user)

        valid_payload = {"sub": 1, "role": "student", "type": "refresh"}
        with self._mock_decode(valid_payload):
            response = client.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": "Bearer valid_refresh_token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        data = body["data"]
        assert len(data["access_token"]) > 0
        assert len(data["refresh_token"]) > 0
        assert data["token_type"] == "bearer"

    def test_refresh_invalid_token(self, client, mock_db_session):
        """Invalid/expired token → code=40004."""
        _override_db(mock_db_session)

        with self._mock_decode(None):  # decode_token returns None
            response = client.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": "Bearer expired_token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40004
        assert "无效" in body["message"] or "过期" in body["message"]

    def test_refresh_access_token_used_as_refresh(self, client, mock_db_session):
        """Access token (type=access) used as refresh → code=40004."""
        _override_db(mock_db_session)

        access_payload = {"sub": 1, "role": "student", "type": "access"}
        with self._mock_decode(access_payload):
            response = client.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": "Bearer access_token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40004

    def test_refresh_user_not_found(self, client, mock_db_session):
        """Valid refresh payload but user not in DB → code=40004."""
        _override_db(mock_db_session)
        make_execute_return(mock_db_session, None)

        valid_payload = {"sub": 999, "role": "student", "type": "refresh"}
        with self._mock_decode(valid_payload):
            response = client.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": "Bearer valid_token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40004

    def test_refresh_disabled_user(self, client, mock_db_session):
        """Valid refresh token but user disabled → code=40004."""
        _override_db(mock_db_session)
        mock_user = create_mock_user(is_active=False)
        make_execute_return(mock_db_session, mock_user)

        valid_payload = {"sub": 1, "role": "student", "type": "refresh"}
        with self._mock_decode(valid_payload):
            response = client.post(
                "/api/v1/auth/refresh",
                headers={"Authorization": "Bearer valid_token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40004

    def test_refresh_no_auth_header(self, client):
        """No Authorization header → 403 from HTTPBearer."""
        response = client.post("/api/v1/auth/refresh")
        assert response.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════
# GET /api/v1/auth/me
# ═══════════════════════════════════════════════════════════════════

class TestMe:
    """Tests for GET /api/v1/auth/me."""

    def test_me_success(self, client):
        """Valid token returns current user info."""
        mock_user = create_mock_user()
        _override_current_user(mock_user)

        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer fake_access_token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        assert body["data"]["user"]["id"] == 1
        assert body["data"]["user"]["username"] == "test001"
        assert body["data"]["user"]["role"] == "student"

    def test_me_no_token_returns_error(self, client):
        """No Authorization header → 403 from HTTPBearer (get_current_user)."""
        response = client.get("/api/v1/auth/me")
        assert response.status_code in (401, 403)

    def test_me_teacher_user(self, client):
        """Teacher role user info is returned correctly."""
        mock_user = create_mock_user(role="teacher", real_name="张老师")
        _override_current_user(mock_user)

        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        assert body["data"]["user"]["role"] == "teacher"
        assert body["data"]["user"]["real_name"] == "张老师"


# ═══════════════════════════════════════════════════════════════════
# PUT /api/v1/auth/password
# ═══════════════════════════════════════════════════════════════════

class TestChangePassword:
    """Tests for PUT /api/v1/auth/password."""

    def test_change_password_success(self, client, mock_db_session):
        """Correct old password → success."""
        old_plain = "OldPass123"
        real_hash = hash_password(old_plain)
        mock_user = create_mock_user(password_hash=real_hash)
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.put(
            "/api/v1/auth/password",
            json={"old_password": old_plain, "new_password": "NewPass456"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        assert body["message"] == "密码修改成功"
        # Verify user's password_hash was updated
        assert mock_user.password_hash != real_hash
        mock_db_session.flush.assert_awaited_once()

    def test_change_password_wrong_old(self, client, mock_db_session):
        """Wrong old password → code=40005."""
        real_hash = hash_password("RealPass123")
        mock_user = create_mock_user(password_hash=real_hash)
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.put(
            "/api/v1/auth/password",
            json={"old_password": "WrongOldPass", "new_password": "NewPass456"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40005
        assert "旧密码错误" in body["message"]

    def test_change_password_new_too_short(self, client, mock_db_session):
        """New password < 6 chars → Pydantic 422."""
        mock_user = create_mock_user()
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.put(
            "/api/v1/auth/password",
            json={"old_password": "OldPass123", "new_password": "12345"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════
# POST /api/v1/auth/reset-password
# ═══════════════════════════════════════════════════════════════════

class TestResetPassword:
    """Tests for POST /api/v1/auth/reset-password."""

    def test_reset_password_success(self, client, mock_db_session):
        """force_password_change=True → success, flag cleared."""
        mock_user = create_mock_user(force_password_change=True)
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewSecure1"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 0
        assert "密码修改成功" in body["message"]
        # Verify force_password_change was cleared
        assert mock_user.force_password_change is False
        mock_db_session.flush.assert_awaited_once()

    def test_reset_password_not_required(self, client, mock_db_session):
        """force_password_change=False → code=40006."""
        mock_user = create_mock_user(force_password_change=False)
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewSecure1"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == 40006
        assert "无需" in body["message"]

    def test_reset_password_new_too_short(self, client, mock_db_session):
        """New password < 6 chars → Pydantic 422."""
        mock_user = create_mock_user(force_password_change=True)
        _override_current_user(mock_user)
        _override_db(mock_db_session)

        response = client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "12345"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 422
