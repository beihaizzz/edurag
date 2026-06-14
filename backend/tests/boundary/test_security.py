"""Security boundary tests — token validation, role-based access, user state.

Covers:
    - Token validation (expired, tampered, wrong type, missing)
    - Role-based access control (student → admin / teacher endpoints)
    - User state (disabled user access denial)
    - Password change authorization (old password required)
"""

import os
import uuid

import pytest

from tests.utils import assert_api_response


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════


def _auth(token: str) -> dict:
    """Build ``Authorization`` header dict from a JWT token string."""
    return {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════════
# 1. Token validation boundary tests
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_expired_token_returns_401(async_client, expired_token):
    """Expired JWT access token on a protected endpoint → 401.

    ``expired_token`` has ``exp`` set 1 hour in the past, so
    ``decode_token`` returns ``None`` and ``get_current_user`` raises 401.
    """
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(expired_token))
    assert resp.status_code == 401, (
        f"Expected 401 for expired token, got {resp.status_code}: {resp.text[:200]}"
    )


@pytest.mark.asyncio
async def test_tampered_token_returns_401(async_client, student_token):
    """Corrupted JWT signature → 401.

    Changing a single character in the signature portion makes
    ``decode_token`` return ``None`` → ``get_current_user`` raises 401.
    """
    # Tamper: flip the last character of the JWT signature
    tampered = student_token[:-1] + ("X" if student_token[-1] != "X" else "Y")
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(tampered))
    assert resp.status_code == 401, (
        f"Expected 401 for tampered token, got {resp.status_code}: {resp.text[:200]}"
    )


@pytest.mark.asyncio
async def test_refresh_token_as_access_token_returns_401(
    async_client, refresh_token_str,
):
    """Refresh token used as access token → 401.

    ``get_current_user`` checks ``payload.get("type") != "access"`` and
    raises 401 with detail ``"请使用 access token"``.
    """
    resp = await async_client.get("/api/v1/auth/me", headers=_auth(refresh_token_str))
    assert resp.status_code == 401, (
        f"Expected 401 for refresh token, got {resp.status_code}: {resp.text[:200]}"
    )
    detail = resp.json().get("detail", "")
    assert "access token" in detail, f"Unexpected detail: {detail!r}"


@pytest.mark.asyncio
async def test_no_token_returns_401(async_client):
    """No Authorization header on a protected endpoint → 401/403.

    FastAPI's ``HTTPBearer`` raises 401 (or 403 in some versions) when
    no credentials are provided.
    """
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403), (
        f"Expected 401 or 403 for missing token, got {resp.status_code}"
    )


# ═══════════════════════════════════════════════════════════════════
# 2. Role-based access control boundary tests
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_student_cannot_access_admin_endpoint(async_client, student_token):
    """Student token on admin-only endpoint → 403.

    ``/api/v1/admin/dashboard`` uses ``Depends(require_role("admin"))``.
    A student user's role does not match → 403 ``"权限不足"``.
    """
    resp = await async_client.get(
        "/api/v1/admin/dashboard",
        headers=_auth(student_token),
    )
    assert resp.status_code == 403, (
        f"Expected 403 for student on admin endpoint, "
        f"got {resp.status_code}: {resp.text[:200]}"
    )


@pytest.mark.asyncio
async def test_student_cannot_access_teacher_document(
    async_client,
    student_token,
    teacher_token,
    sample_txt_file,
):
    """Student tries to update a document uploaded by a teacher → 403.

    1. Teacher uploads a document.
    2. Student attempts ``PUT /api/v1/documents/{id}``.
    3. ``_check_permission`` sees student is not the uploader and not admin
       → 403 ``"只能操作自己上传的文档"``.
    """
    # ── Upload document as teacher ──
    filename = os.path.basename(sample_txt_file)
    with open(sample_txt_file, "rb") as f:
        upload_resp = await async_client.post(
            "/api/v1/documents",
            files={"file": (filename, f, "text/plain")},
            data={
                "title": "Teacher\u2019s private document",
                "file_type": "reference",
                "description": "Should not be modifiable by students",
                "tags": '["security", "boundary"]',
            },
            headers=_auth(teacher_token),
        )
    assert upload_resp.status_code == 201, (
        f"Teacher upload failed: {upload_resp.status_code} — {upload_resp.text[:200]}"
    )
    doc_id = upload_resp.json()["data"]["id"]

    # ── Student attempts update → 403 ──
    resp = await async_client.put(
        f"/api/v1/documents/{doc_id}",
        json={"title": "Hacked by student"},
        headers=_auth(student_token),
    )
    assert resp.status_code == 403, (
        f"Expected 403 for student updating teacher's document, "
        f"got {resp.status_code}: {resp.text[:200]}"
    )


# ═══════════════════════════════════════════════════════════════════
# 3. Disabled user boundary test
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_disabled_user_cannot_access(async_client, disabled_user_token):
    """Disabled user (is_active=False) token on protected endpoint → 403.

    ``get_current_user`` checks ``user.is_active`` and raises 403
    ``"账号已被禁用"`` when the user is deactivated.
    """
    resp = await async_client.get(
        "/api/v1/auth/me", headers=_auth(disabled_user_token),
    )
    assert resp.status_code == 403, (
        f"Expected 403 for disabled user, got {resp.status_code}: {resp.text[:200]}"
    )


# ═══════════════════════════════════════════════════════════════════
# 4. Password change authorization boundary test
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_password_change_requires_old_password(async_client, create_test_user):
    """Wrong old password on password-change → HTTP 200, code=40005.

    The endpoint ``PUT /api/v1/auth/password`` returns an APIResponse
    (HTTP 200) with business-logic error code 40005 and message
    ``"旧密码错误"`` when the provided ``old_password`` does not match.
    """
    password = "CorrectOld@123"
    _user, token = await create_test_user(password=password)

    resp = await async_client.put(
        "/api/v1/auth/password",
        json={"old_password": "WrongOld@456", "new_password": "NewPass@789"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, (
        f"Expected HTTP 200 (business error via APIResponse), "
        f"got {resp.status_code}"
    )
    body = resp.json()
    assert body["code"] == 40005, (
        f"Expected code=40005, got code={body.get('code')}: {body.get('message', '')}"
    )
    assert "旧密码错误" in body["message"], (
        f"Expected '旧密码错误' in message, got: {body['message']!r}"
    )


@pytest.mark.asyncio
async def test_password_change_missing_old_password_returns_422(
    async_client, create_test_user,
):
    """Missing ``old_password`` field → 422 validation error.

    ``ChangePasswordRequest.old_password`` is ``Field(...)`` (required).
    Omitting it triggers Pydantic validation → HTTP 422.
    """
    _user, token = await create_test_user()

    resp = await async_client.put(
        "/api/v1/auth/password",
        json={"new_password": "NewPass@789"},
        headers=_auth(token),
    )
    assert resp.status_code == 422, (
        f"Expected 422 for missing old_password, "
        f"got {resp.status_code}: {resp.text[:200]}"
    )
