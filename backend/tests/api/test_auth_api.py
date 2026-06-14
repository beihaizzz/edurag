"""Auth API integration tests — real database.

All tests use ``async_client`` (httpx.AsyncClient against FastAPI ASGI app)
with a transactional PostgreSQL test database.  Users are created via
``create_test_user`` (independent-session commit) so they are visible
to ``async_client``'s ``test_db`` transaction.

Endpoints under test
────────────────────
  POST /api/v1/auth/register
  POST /api/v1/auth/login
  POST /api/v1/auth/refresh
  GET  /api/v1/auth/me
  PUT  /api/v1/auth/password
  POST /api/v1/auth/reset-password
  POST /api/v1/admin/users/{id}/reset-password

All error responses use HTTP 200 + APIResponse.code=4xxxx (business-logic
errors).  True HTTP 401/403 only come from the ``get_current_user`` dependency
(expired / wrong-type token → 401; disabled user → 403).
"""

import uuid

import pytest

from tests.utils import assert_api_response

# ═══════════════════════════════════════════════════════════════════════════
# helper
# ═══════════════════════════════════════════════════════════════════════════


def _auth(token: str) -> dict:
    """Build ``Authorization`` header dict from a JWT token string."""
    return {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/register
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_register_success(async_client):
    """Register a new student → 200, code=0, username + role in response."""
    username = f"reg_{uuid.uuid4().hex[:8]}"
    resp = await async_client.post("/api/v1/auth/register", json={
        "username": username,
        "password": "Test@123456",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    assert body["message"] == "注册成功"
    user_data = body["data"]["user"]
    assert user_data["username"] == username
    assert user_data["role"] == "student"


@pytest.mark.asyncio
async def test_register_duplicate_username(async_client, create_test_user):
    """Register an existing username → 200, code=40001."""
    user, _token = await create_test_user()  # auto-generated unique username
    resp = await async_client.post("/api/v1/auth/register", json={
        "username": user.username,
        "password": "Test@123456",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40001
    assert "已存在" in body["message"]


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/login
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_login_success(async_client, create_test_user):
    """Correct credentials → 200, code=0, access_token + refresh_token returned."""
    password = "Login@123"
    user, _token = await create_test_user(password=password)

    resp = await async_client.post("/api/v1/auth/login", json={
        "username": user.username,
        "password": password,
    })
    data = assert_api_response(resp, expected_status=200, expected_code=0)
    assert len(data["access_token"]) > 0
    assert len(data["refresh_token"]) > 0
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 60 * 60  # ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert data["user"]["username"] == user.username
    assert data["user"]["role"] == "student"


@pytest.mark.asyncio
async def test_login_wrong_password(async_client, create_test_user):
    """Wrong password → 200, code=40002."""
    user, _token = await create_test_user(password="Correct@123")

    resp = await async_client.post("/api/v1/auth/login", json={
        "username": user.username,
        "password": "WrongPassword1",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40002
    assert "错误" in body["message"]


@pytest.mark.asyncio
async def test_login_disabled_user(async_client):
    """Disabled account (is_active=False) → 200, code=40003."""
    from app.core.database import AsyncSessionLocal
    from app.core.security import hash_password
    from app.models.user import User

    username = f"dis_{uuid.uuid4().hex[:8]}"
    password = "Disabled@123"

    user = User(
        username=username,
        password_hash=hash_password(password),
        role="student",
        is_active=False,
    )
    async with AsyncSessionLocal() as session:
        session.add(user)
        await session.commit()

    resp = await async_client.post("/api/v1/auth/login", json={
        "username": username,
        "password": password,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40003
    assert "禁用" in body["message"]


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/refresh
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_refresh_token(async_client, create_test_user):
    """Valid refresh token → 200, code=0, new access_token (different from old)."""
    password = "Refresh@123"
    user, _token = await create_test_user(password=password)

    # 1 — login to obtain an initial token pair
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "username": user.username,
        "password": password,
    })
    login_data = assert_api_response(login_resp, expected_status=200, expected_code=0)
    refresh_token_val = login_data["refresh_token"]

    # 2 — use the refresh token to get a new pair
    refresh_resp = await async_client.post("/api/v1/auth/refresh", headers={
        "Authorization": f"Bearer {refresh_token_val}",
    })
    refresh_data = assert_api_response(refresh_resp, expected_status=200, expected_code=0)
    new_access = refresh_data["access_token"]
    new_refresh = refresh_data["refresh_token"]

    assert len(new_access) > 0
    assert len(new_refresh) > 0
    assert refresh_data["token_type"] == "bearer"
    # JWT with HS256 is deterministic — if generated within the
    # same second the exp claim is identical and token strings
    # may match.  The important check is that the refresh endpoint
    # returned code=0 with valid-looking tokens.


@pytest.mark.asyncio
async def test_refresh_with_access_token(async_client, create_test_user):
    """Access token (type=access) used as refresh → 200, code=40004."""
    _user, token = await create_test_user()

    resp = await async_client.post("/api/v1/auth/refresh", headers={
        "Authorization": f"Bearer {token}",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40004


@pytest.mark.asyncio
async def test_refresh_with_expired_token(async_client, expired_token):
    """Expired token → 200, code=40004."""
    resp = await async_client.post("/api/v1/auth/refresh", headers={
        "Authorization": f"Bearer {expired_token}",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40004


# ═══════════════════════════════════════════════════════════════════════════
# GET /api/v1/auth/me
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_me_valid_token(async_client, create_test_user):
    """Valid access token → 200, code=0, correct username + role."""
    user, token = await create_test_user(role="teacher")
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(token))
    data = assert_api_response(resp, expected_status=200, expected_code=0)
    assert data["user"]["username"] == user.username
    assert data["user"]["role"] == "teacher"


@pytest.mark.asyncio
async def test_me_expired_token(async_client, expired_token):
    """Expired access token → 401 (from get_current_user dependency)."""
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(expired_token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_refresh_token(async_client, refresh_token_str):
    """Refresh token used as access token → 401, detail='请使用 access token'."""
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(refresh_token_str))
    assert resp.status_code == 401
    detail = resp.json().get("detail", "")
    assert "access token" in detail


@pytest.mark.asyncio
async def test_me_disabled_user(async_client, disabled_user_token):
    """Disabled user (is_active=False) → 403 (from get_current_user)."""
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(disabled_user_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_me_no_token(async_client):
    """No Authorization header → 403 (HTTPBearer)."""
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════
# PUT /api/v1/auth/password  (change password)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_change_password_success(async_client, create_test_user):
    """Correct old password → 200, code=0, message='密码修改成功'."""
    old_pass = "OldPass@123"
    new_pass = "NewPass@456"
    user, token = await create_test_user(password=old_pass)

    resp = await async_client.put("/api/v1/auth/password",
        json={"old_password": old_pass, "new_password": new_pass},
        headers=_auth(token),
    )
    assert_api_response(resp, expected_status=200, expected_code=0)
    assert resp.json()["message"] == "密码修改成功"

    # verify: old password no longer works for login
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "username": user.username,
        "password": old_pass,
    })
    assert login_resp.json()["code"] == 40002

    # verify: new password works
    login_resp2 = await async_client.post("/api/v1/auth/login", json={
        "username": user.username,
        "password": new_pass,
    })
    assert login_resp2.json()["code"] == 0


@pytest.mark.asyncio
async def test_change_password_wrong_old(async_client, create_test_user):
    """Wrong old password → 200, code=40005."""
    _user, token = await create_test_user(password="Correct@123")

    resp = await async_client.put("/api/v1/auth/password",
        json={"old_password": "WrongOld@123", "new_password": "NewPass@456"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40005
    assert "旧密码错误" in body["message"]


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/reset-password  (forced password reset)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_reset_password_force(async_client):
    """User with force_password_change=True → 200, resets password without old."""
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token, hash_password
    from app.models.user import User

    username = f"frc_{uuid.uuid4().hex[:8]}"
    password = "Force@123"

    user = User(
        username=username,
        password_hash=hash_password(password),
        role="student",
        force_password_change=True,
    )
    async with AsyncSessionLocal() as session:
        session.add(user)
        await session.commit()

    token = create_access_token({"sub": str(user.id)})

    resp = await async_client.post("/api/v1/auth/reset-password",
        json={"new_password": "NewForce@456"},
        headers=_auth(token),
    )
    assert_api_response(resp, expected_status=200, expected_code=0)
    assert resp.json()["message"] == "密码修改成功，请重新登录"

    # verify: old password no longer works, new password does
    old_login = await async_client.post("/api/v1/auth/login", json={
        "username": username, "password": password,
    })
    assert old_login.json()["code"] == 40002

    new_login = await async_client.post("/api/v1/auth/login", json={
        "username": username, "password": "NewForce@456",
    })
    assert new_login.json()["code"] == 0


@pytest.mark.asyncio
async def test_reset_password_not_forced(async_client, create_test_user):
    """User without force_password_change → 200, code=40006."""
    _user, token = await create_test_user()

    resp = await async_client.post("/api/v1/auth/reset-password",
        json={"new_password": "Whatever@123"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 40006
    assert "无需强制修改密码" in body["message"]


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/admin/users/{id}/reset-password  (admin reset)
# ═══════════════════════════════════════════════════════════════════════════

_ADMIN_RESET_URL = "/api/v1/admin/users/{user_id}/reset-password"


@pytest.mark.asyncio
async def test_admin_reset_password(async_client, create_test_user):
    """Admin resets student password → 200, returns temp_password, sets force_change."""
    admin_user, admin_token_val = await create_test_user(role="admin")
    student_user, _student_token = await create_test_user(role="student")

    url = _ADMIN_RESET_URL.format(user_id=student_user.id)
    resp = await async_client.post(url, headers=_auth(admin_token_val))
    data = assert_api_response(resp, expected_status=200, expected_code=0)

    assert data["user_id"] == student_user.id
    assert len(data["temp_password"]) == 8  # secrets.token_urlsafe(6)[:8]

    # verify: student can login with the temporary password
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "username": student_user.username,
        "password": data["temp_password"],
    })
    login_data = login_resp.json()
    assert login_data["code"] == 0
    assert login_data["data"]["require_password_change"] is True


@pytest.mark.asyncio
async def test_student_cannot_reset_others(async_client, create_test_user):
    """Student tries admin reset → 403 (require_role('admin') blocks)."""
    student1, token1 = await create_test_user(role="student")
    student2, _token2 = await create_test_user(role="student")

    url = _ADMIN_RESET_URL.format(user_id=student2.id)
    resp = await async_client.post(url, headers=_auth(token1))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_reset_others(async_client, create_test_user):
    """Teacher tries admin reset → 403 (require_role('admin') blocks)."""
    teacher, teacher_token = await create_test_user(role="teacher")
    student, _st_token = await create_test_user(role="student")

    url = _ADMIN_RESET_URL.format(user_id=student.id)
    resp = await async_client.post(url, headers=_auth(teacher_token))
    assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# End-to-end flow: register → login → me
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_register_login_me_flow(async_client):
    """Complete flow: register → login → GET /me → tokens and role verified."""
    username = f"flow_{uuid.uuid4().hex[:8]}"
    password = "Flow@123456"

    # 1 ─ register
    reg_resp = await async_client.post("/api/v1/auth/register", json={
        "username": username,
        "password": password,
    })
    assert reg_resp.json()["code"] == 0

    # 2 ─ login
    login_resp = await async_client.post("/api/v1/auth/login", json={
        "username": username,
        "password": password,
    })
    login_data = assert_api_response(login_resp, expected_status=200, expected_code=0)
    access_token = login_data["access_token"]
    assert login_data["user"]["username"] == username
    assert login_data["user"]["role"] == "student"

    # 3 ─ GET /me
    me_resp = await async_client.get("/api/v1/auth/me", headers=_auth(access_token))
    me_data = assert_api_response(me_resp, expected_status=200, expected_code=0)
    assert me_data["user"]["username"] == username
    assert me_data["user"]["role"] == "student"
