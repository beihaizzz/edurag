"""API integration tests for course management and admin endpoints.

Course endpoints (prefix /api/v1):
    POST   /courses               — create course (teacher/admin)
    GET    /courses               — list courses (authenticated)
    GET    /courses/{id}          — course detail
    PUT    /courses/{id}          — update (teacher-owner or admin)
    DELETE /courses/{id}          — soft delete (admin only)

Admin endpoints (prefix /api/v1/admin):
    GET    /admin/dashboard        — stats (admin only)
    GET    /admin/users            — user list (admin only)
    PUT    /admin/users/{id}/disable  — toggle user active (admin only)
    POST   /admin/users/{id}/reset-password — reset password (admin only)
    GET    /admin/audit-logs       — audit log (admin only)

Success responses follow APIResponse format: {code: 0, message, data}.
Error responses return FastAPI default {detail: "..."} or APIResponse {code: N, message}.
"""

import pytest

from app.core.security import decode_token
from tests.utils import assert_api_response

# ── URL constants ──────────────────────────────────────────────────────

COURSES_URL = "/api/v1/courses"
ADMIN_USERS_URL = "/api/v1/admin/users"
ADMIN_DASHBOARD_URL = "/api/v1/admin/dashboard"
ADMIN_AUDIT_URL = "/api/v1/admin/audit-logs"

# Course create endpoint defaults to 200 (no explicit status_code=201)
CREATE_STATUS = 200


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


def _user_id_from_token(token: str) -> int:
    """Extract user ID from a JWT access token using app's decoder."""
    payload = decode_token(token)
    assert payload is not None, "Token decode failed"
    return int(payload["sub"])


# ═══════════════════════════════════════════════════════════════════════
# Course CRUD — role-based access
# ═══════════════════════════════════════════════════════════════════════


class TestCourseCreate:
    """POST /api/v1/courses — create course (teacher/admin)."""

    async def test_teacher_can_create_course(self, async_client, teacher_token):
        """Teacher creates course → 201 with correct fields."""
        response = await async_client.post(
            COURSES_URL,
            json={
                "name": "人工智能导论",
                "semester": "2025-2026-2",
                "description": "AI基础课程",
            },
            headers=_auth(teacher_token),
        )
        data = assert_api_response(response, CREATE_STATUS, expected_code=0)
        assert data["name"] == "人工智能导论"
        assert data["semester"] == "2025-2026-2"
        assert data["description"] == "AI基础课程"
        assert data["teacher"] is not None
        assert data["teacher"]["id"] is not None
        assert data["is_deleted"] is False

    async def test_admin_can_create_course(self, async_client, admin_token):
        """Admin creates course → 201. Teacher field is the admin."""
        response = await async_client.post(
            COURSES_URL,
            json={
                "name": "高级算法",
                "semester": "2025-2026-2",
                "description": "算法分析与设计",
            },
            headers=_auth(admin_token),
        )
        data = assert_api_response(response, CREATE_STATUS, expected_code=0)
        assert data["name"] == "高级算法"
        assert data["teacher"] is not None

    async def test_student_cannot_create_course(self, async_client, student_token):
        """Student creates course → 403 Forbidden."""
        response = await async_client.post(
            COURSES_URL,
            json={"name": "Hack Course", "semester": "2025-2026-2"},
            headers=_auth(student_token),
        )
        assert response.status_code == 403

    async def test_unauthenticated_cannot_create_course(self, async_client):
        """No auth header → 401 or 403."""
        response = await async_client.post(
            COURSES_URL,
            json={"name": "Ghost Course", "semester": "2025-2026-2"},
        )
        assert response.status_code in (401, 403)

    async def test_create_course_missing_required_field(self, async_client, teacher_token):
        """Missing semester field → 422 Validation Error."""
        response = await async_client.post(
            COURSES_URL,
            json={"name": "Incomplete"},
            headers=_auth(teacher_token),
        )
        assert response.status_code == 422


class TestCourseList:
    """GET /api/v1/courses — list (all authenticated users)."""

    async def test_student_can_list_courses(self, async_client, student_token, teacher_token):
        """Student lists courses after a course exists → 200 with paginated data."""
        # Ensure at least one course exists
        await async_client.post(
            COURSES_URL,
            json={"name": "测试课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )

        response = await async_client.get(COURSES_URL, headers=_auth(student_token))
        data = assert_api_response(response, 200, expected_code=0)

        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    async def test_list_courses_paginated(self, async_client, student_token, teacher_token):
        """Pagination params (page, page_size) work correctly."""
        for i in range(3):
            await async_client.post(
                COURSES_URL,
                json={"name": f"课程{i}", "semester": "2025-2026-2"},
                headers=_auth(teacher_token),
            )

        response = await async_client.get(
            COURSES_URL,
            params={"page": 1, "page_size": 2},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200)
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert len(data["items"]) <= 2

    async def test_list_courses_filter_by_semester(self, async_client, student_token, teacher_token):
        """Filter by semester returns only matching courses."""
        await async_client.post(
            COURSES_URL,
            json={"name": "S1课", "semester": "2024-2025-1"},
            headers=_auth(teacher_token),
        )
        await async_client.post(
            COURSES_URL,
            json={"name": "S2课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )

        response = await async_client.get(
            COURSES_URL,
            params={"semester": "2024-2025-1"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200)
        for item in data["items"]:
            assert item["semester"] == "2024-2025-1"

    async def test_unauthenticated_cannot_list_courses(self, async_client):
        """No auth → 401/403."""
        response = await async_client.get(COURSES_URL)
        assert response.status_code in (401, 403)


class TestCourseDetail:
    """GET /api/v1/courses/{id} — detail (authenticated)."""

    async def test_get_course_detail(self, async_client, student_token, teacher_token):
        """Get course by ID → 200 with full detail including teacher."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "详情课", "semester": "2025-2026-2", "description": "详细描述"},
            headers=_auth(teacher_token),
        )
        course_data = assert_api_response(create_resp, CREATE_STATUS)
        course_id = course_data["id"]

        response = await async_client.get(
            f"{COURSES_URL}/{course_id}", headers=_auth(student_token)
        )
        data = assert_api_response(response, 200)
        assert data["id"] == course_id
        assert data["name"] == "详情课"
        assert data["description"] == "详细描述"
        assert data["teacher"] is not None
        assert "real_name" in data["teacher"]

    async def test_get_nonexistent_course(self, async_client, student_token):
        """Non-existent course ID → 404."""
        response = await async_client.get(
            f"{COURSES_URL}/99999", headers=_auth(student_token)
        )
        assert response.status_code == 404

    async def test_get_deleted_course_returns_404(self, async_client, admin_token, student_token):
        """Soft-deleted course is invisible → 404."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "待删课", "semester": "2025-2026-2"},
            headers=_auth(admin_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]
        await async_client.delete(f"{COURSES_URL}/{course_id}", headers=_auth(admin_token))

        response = await async_client.get(
            f"{COURSES_URL}/{course_id}", headers=_auth(student_token)
        )
        assert response.status_code == 404


class TestCourseUpdate:
    """PUT /api/v1/courses/{id} — update (teacher-owner or admin)."""

    async def test_teacher_can_update_own_course(self, async_client, teacher_token):
        """Teacher who created the course can update it → 200."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "我的课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        update_resp = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "我的课-v2"},
            headers=_auth(teacher_token),
        )
        data = assert_api_response(update_resp, 200)
        assert data["name"] == "我的课-v2"

    async def test_teacher_cannot_update_other_course(self, async_client, teacher_token, admin_token):
        """Teacher A cannot update teacher B's course → 403 (course isolation)."""
        # Admin creates course as teacher A
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "Admin专属课", "semester": "2025-2026-2"},
            headers=_auth(admin_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        # Different teacher tries to hijack it
        response = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "Hijacked!"},
            headers=_auth(teacher_token),
        )
        assert response.status_code == 403

    async def test_admin_can_update_any_course(self, async_client, teacher_token, admin_token):
        """Admin can update any teacher's course → 200."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "教师课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        update_resp = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "Admin修改版"},
            headers=_auth(admin_token),
        )
        data = assert_api_response(update_resp, 200)
        assert data["name"] == "Admin修改版"

    async def test_student_cannot_update_course(self, async_client, student_token, teacher_token):
        """Student cannot update any course → 403."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "学生勿动", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        response = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "Stolen!"},
            headers=_auth(student_token),
        )
        assert response.status_code == 403

    async def test_update_partial_fields(self, async_client, teacher_token):
        """Partial update — only provided fields change."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "原课", "semester": "2025-2026-2", "description": "原描述"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        # Only update name, leave description unchanged
        update_resp = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "新课名"},
            headers=_auth(teacher_token),
        )
        data = assert_api_response(update_resp, 200)
        assert data["name"] == "新课名"
        assert data["description"] == "原描述"


class TestCourseDelete:
    """DELETE /api/v1/courses/{id} — soft delete (admin only)."""

    async def test_admin_can_delete_course(self, async_client, admin_token):
        """Admin soft-deletes course → 200; course becomes inaccessible."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "待删除", "semester": "2025-2026-2"},
            headers=_auth(admin_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        delete_resp = await async_client.delete(
            f"{COURSES_URL}/{course_id}", headers=_auth(admin_token)
        )
        assert delete_resp.status_code == 200
        body = delete_resp.json()
        assert body["message"] == "课程已删除"

        # Soft-deleted course is invisible to GET
        get_resp = await async_client.get(
            f"{COURSES_URL}/{course_id}", headers=_auth(admin_token)
        )
        assert get_resp.status_code == 404

    async def test_teacher_cannot_delete_course(self, async_client, teacher_token):
        """Teacher cannot delete any course → 403."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "教师不可删", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        response = await async_client.delete(
            f"{COURSES_URL}/{course_id}", headers=_auth(teacher_token)
        )
        assert response.status_code == 403

    async def test_student_cannot_delete_course(self, async_client, student_token, teacher_token):
        """Student cannot delete any course → 403."""
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "学生不可删", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        response = await async_client.delete(
            f"{COURSES_URL}/{course_id}", headers=_auth(student_token)
        )
        assert response.status_code == 403

    async def test_delete_nonexistent_course(self, async_client, admin_token):
        """Delete non-existent course → 404."""
        response = await async_client.delete(
            f"{COURSES_URL}/99999", headers=_auth(admin_token)
        )
        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# Admin endpoints — role gating
# ═══════════════════════════════════════════════════════════════════════


class TestAdminDashboard:
    """GET /api/v1/admin/dashboard — admin-only stats."""

    async def test_admin_can_access_dashboard(self, async_client, admin_token):
        """Admin accesses dashboard → 200 with stat fields."""
        response = await async_client.get(ADMIN_DASHBOARD_URL, headers=_auth(admin_token))
        data = assert_api_response(response, 200, expected_code=0)

        for field in (
            "total_users",
            "total_courses",
            "total_docs",
            "pending_docs",
            "total_qa",
            "today_qa",
        ):
            assert field in data, f"Dashboard missing field '{field}'"

    async def test_non_admin_cannot_access_dashboard(self, async_client, student_token):
        """Student accessing admin dashboard → 403."""
        response = await async_client.get(ADMIN_DASHBOARD_URL, headers=_auth(student_token))
        assert response.status_code == 403

    async def test_teacher_cannot_access_dashboard(self, async_client, teacher_token):
        """Teacher accessing admin dashboard → 403."""
        response = await async_client.get(ADMIN_DASHBOARD_URL, headers=_auth(teacher_token))
        assert response.status_code == 403

    async def test_unauthenticated_cannot_access_dashboard(self, async_client):
        """No auth → 401/403."""
        response = await async_client.get(ADMIN_DASHBOARD_URL)
        assert response.status_code in (401, 403)


class TestAdminUsers:
    """GET /api/v1/admin/users + PUT disable — admin-only user management."""

    async def test_admin_can_list_users(self, async_client, admin_token):
        """Admin lists users → 200 with paginated data."""
        response = await async_client.get(ADMIN_USERS_URL, headers=_auth(admin_token))
        data = assert_api_response(response, 200, expected_code=0)

        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1
        for user in data["items"]:
            for field in ("id", "username", "role", "is_active"):
                assert field in user, f"User item missing field '{field}'"

    async def test_admin_can_filter_users_by_role(self, async_client, admin_token):
        """Admin filters users by role → only matching users."""
        response = await async_client.get(
            ADMIN_USERS_URL,
            params={"role": "admin"},
            headers=_auth(admin_token),
        )
        data = assert_api_response(response, 200)
        for user in data["items"]:
            assert user["role"] == "admin"

    async def test_admin_can_disable_user(self, async_client, admin_token, student_token):
        """Admin toggles user active status → 200; state flips."""
        student_id = _user_id_from_token(student_token)

        # Disable
        resp1 = await async_client.put(
            f"{ADMIN_USERS_URL}/{student_id}/disable",
            headers=_auth(admin_token),
        )
        assert resp1.status_code == 200
        body1 = resp1.json()
        assert body1.get("code") == 0
        assert body1["data"]["is_active"] is False

        # Re-enable (toggle back)
        resp2 = await async_client.put(
            f"{ADMIN_USERS_URL}/{student_id}/disable",
            headers=_auth(admin_token),
        )
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert body2["data"]["is_active"] is True

    async def test_admin_disable_nonexistent_user(self, async_client, admin_token):
        """Disable non-existent user → 40401 APIResponse code."""
        response = await async_client.put(
            f"{ADMIN_USERS_URL}/99999/disable",
            headers=_auth(admin_token),
        )
        body = response.json()
        assert body.get("code") == 40401

    async def test_admin_can_reset_password(self, async_client, admin_token, student_token):
        """Admin resets a user's password → 200 with temp_password."""
        student_id = _user_id_from_token(student_token)

        response = await async_client.post(
            f"{ADMIN_USERS_URL}/{student_id}/reset-password",
            headers=_auth(admin_token),
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("code") == 0
        assert "temp_password" in body["data"]
        assert body["data"]["user_id"] == student_id

    async def test_non_admin_cannot_list_users(self, async_client, student_token):
        """Student accessing admin user list → 403."""
        response = await async_client.get(ADMIN_USERS_URL, headers=_auth(student_token))
        assert response.status_code == 403

    async def test_non_admin_cannot_disable_user(self, async_client, student_token):
        """Student cannot disable a user → 403."""
        response = await async_client.put(
            f"{ADMIN_USERS_URL}/1/disable",
            headers=_auth(student_token),
        )
        assert response.status_code == 403

    async def test_non_admin_cannot_reset_password(self, async_client, student_token):
        """Student cannot reset any password → 403."""
        response = await async_client.post(
            f"{ADMIN_USERS_URL}/1/reset-password",
            headers=_auth(student_token),
        )
        assert response.status_code == 403


class TestAdminAuditLogs:
    """GET /api/v1/admin/audit-logs — admin-only audit trail."""

    async def test_admin_can_access_audit_logs(self, async_client, admin_token):
        """Admin accesses audit logs → 200 with paginated data."""
        response = await async_client.get(ADMIN_AUDIT_URL, headers=_auth(admin_token))
        data = assert_api_response(response, 200, expected_code=0)

        assert "items" in data
        assert "total" in data
        assert "page" in data

    async def test_non_admin_cannot_access_audit_logs(self, async_client, student_token):
        """Student accessing audit logs → 403."""
        response = await async_client.get(ADMIN_AUDIT_URL, headers=_auth(student_token))
        assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# Course isolation — cross-cutting role enforcement
# ═══════════════════════════════════════════════════════════════════════


class TestCourseIsolation:
    """Tests that role boundaries are enforced across course operations."""

    async def test_two_teachers_courses_are_isolated(
        self, async_client, teacher_token, admin_token
    ):
        """Teacher A's update on teacher B's course is rejected → 403."""
        # Teacher creates a course
        c1 = await async_client.post(
            COURSES_URL,
            json={"name": "T1的课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        c1_id = assert_api_response(c1, CREATE_STATUS)["id"]

        # Admin creates a course (acts as a different teacher)
        c2 = await async_client.post(
            COURSES_URL,
            json={"name": "Admin的课", "semester": "2025-2026-2"},
            headers=_auth(admin_token),
        )
        c2_id = assert_api_response(c2, CREATE_STATUS)["id"]

        # Teacher tries to update admin's course → 403
        resp = await async_client.put(
            f"{COURSES_URL}/{c2_id}",
            json={"name": "Cross!"},
            headers=_auth(teacher_token),
        )
        assert resp.status_code == 403

        # Teacher can still update own course → 200
        resp2 = await async_client.put(
            f"{COURSES_URL}/{c1_id}",
            json={"name": "T1的课-v2"},
            headers=_auth(teacher_token),
        )
        assert_api_response(resp2, 200)

    async def test_student_isolated_from_course_modifications(
        self, async_client, student_token, teacher_token
    ):
        """Student cannot create, update, or delete courses."""
        # Create by teacher
        create_resp = await async_client.post(
            COURSES_URL,
            json={"name": "隔离课", "semester": "2025-2026-2"},
            headers=_auth(teacher_token),
        )
        course_id = assert_api_response(create_resp, CREATE_STATUS)["id"]

        # Student update → 403
        upd = await async_client.put(
            f"{COURSES_URL}/{course_id}",
            json={"name": "Bad"},
            headers=_auth(student_token),
        )
        assert upd.status_code == 403

        # Student delete → 403
        dlt = await async_client.delete(
            f"{COURSES_URL}/{course_id}", headers=_auth(student_token)
        )
        assert dlt.status_code == 403

        # Student create → 403
        crt = await async_client.post(
            COURSES_URL,
            json={"name": "Hack", "semester": "2025-2026-2"},
            headers=_auth(student_token),
        )
        assert crt.status_code == 403
