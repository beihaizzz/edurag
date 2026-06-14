"""API integration tests for feedback endpoints.

POST /api/v1/feedback  — submit feedback (qa_id, type, optional comment)
GET  /api/v1/feedback  — list own feedback (paginated)

All tests use the ``async_client`` fixture (httpx.AsyncClient against
the real FastAPI ASGI app) with a transactional PostgreSQL test database.

Users are created within the test DB transaction (``test_db``) to avoid
cross-test accumulation from fixtures that commit directly.
Tokens are generated from ``create_access_token``.

Success responses follow APIResponse format: {code: 0, message, data}.
Error responses from HTTPException follow FastAPI default: {detail: "..."}.
"""

import uuid

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models import QAHistory, User
from tests.utils import assert_api_response

# ─────────────────────────────────────────────────────────────────────────
# constants & helpers
# ─────────────────────────────────────────────────────────────────────────

_FEEDBACK_URL = "/api/v1/feedback"


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


async def _create_user(
    db, role: str = "student", prefix: str = "stu"
) -> tuple[User, str]:
    """Create a user inside the test DB transaction and return (user, JWT).

    Everything is scoped to *db* (which rolls back on teardown), so no
    data leaks between tests.
    """
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    user = User(
        username=username,
        password_hash=hash_password("pass123"),
        role=role,
        real_name=f"Test {role}",
        email=f"{username}@test.local",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return user, token


async def _create_qa(
    db, user_id: int, *, question: str = "测试问题?", answer: str = "测试答案。"
) -> QAHistory:
    """Helper: create a QA history record in the test database."""
    qa = QAHistory(user_id=user_id, question=question, answer=answer)
    db.add(qa)
    await db.flush()
    await db.refresh(qa)
    return qa


# ═════════════════════════════════════════════════════════════════════════
# POST /api/v1/feedback — Submit feedback
# ═════════════════════════════════════════════════════════════════════════


class TestFeedbackCreate:
    """Tests for POST /api/v1/feedback."""

    # ── success cases ──────────────────────────────────────────────────

    async def test_create_feedback_success(
        self, async_client, test_db
    ):
        """Submit feedback for an existing QA → 200 with feedback data."""
        # Arrange
        user, token = await _create_user(test_db)
        qa = await _create_qa(test_db, user.id)

        # Act
        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "useful", "comment": "讲解很清晰！"},
            headers=_auth(token),
        )

        # Assert
        data = assert_api_response(response, 200, expected_code=0)
        assert data["qa_id"] == qa.id
        assert data["type"] == "useful"
        assert data["comment"] == "讲解很清晰！"
        assert "id" in data
        assert "created_at" in data

    async def test_create_feedback_without_comment(
        self, async_client, test_db
    ):
        """Submit feedback without optional comment → 200."""
        user, token = await _create_user(test_db)
        qa = await _create_qa(test_db, user.id)

        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "useless"},
            headers=_auth(token),
        )

        data = assert_api_response(response, 200, expected_code=0)
        assert data["qa_id"] == qa.id
        assert data["type"] == "useless"
        # comment defaults to empty string
        assert data["comment"] == ""

    # ── error cases ────────────────────────────────────────────────────

    async def test_duplicate_feedback_returns_409(
        self, async_client, test_db
    ):
        """Submit duplicate feedback for the same QA → 409 Conflict."""
        # Arrange
        user, token = await _create_user(test_db)
        qa = await _create_qa(test_db, user.id)

        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "useful"},
            headers=_auth(token),
        )

        # Act — same user, same QA, different type
        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "useless"},
            headers=_auth(token),
        )

        # Assert
        assert response.status_code == 409
        body = response.json()
        assert "detail" in body

    async def test_feedback_non_existent_qa_returns_404(
        self, async_client, test_db
    ):
        """Submit feedback for a non-existent QA → 404."""
        _, token = await _create_user(test_db)

        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": 99999, "type": "useful"},
            headers=_auth(token),
        )

        assert response.status_code == 404
        body = response.json()
        assert "detail" in body

    async def test_invalid_type_returns_422(
        self, async_client, test_db
    ):
        """Submit feedback with invalid type → 422 Unprocessable Entity."""
        user, token = await _create_user(test_db)
        qa = await _create_qa(test_db, user.id)

        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "invalid"},
            headers=_auth(token),
        )

        assert response.status_code == 422

    async def test_missing_qa_id_returns_422(
        self, async_client, test_db
    ):
        """Submit feedback without qa_id → 422."""
        _, token = await _create_user(test_db)

        response = await async_client.post(
            _FEEDBACK_URL,
            json={"type": "useful"},
            headers=_auth(token),
        )

        assert response.status_code == 422

    async def test_unauthorized_returns_401(
        self, async_client
    ):
        """Submit feedback without auth token → 401."""
        response = await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": 1, "type": "useful"},
        )

        assert response.status_code == 401


# ═════════════════════════════════════════════════════════════════════════
# GET /api/v1/feedback — List feedback
# ═════════════════════════════════════════════════════════════════════════


class TestFeedbackList:
    """Tests for GET /api/v1/feedback."""

    async def test_list_feedback_empty(
        self, async_client, test_db
    ):
        """List feedback when none exists → 200 with empty items."""
        _, token = await _create_user(test_db)

        response = await async_client.get(
            _FEEDBACK_URL,
            headers=_auth(token),
        )

        data = assert_api_response(response, 200, expected_code=0)
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 20
        assert data["total_pages"] == 0

    async def test_list_feedback_with_items(
        self, async_client, test_db
    ):
        """List feedback after submitting items."""
        # Arrange
        user, token = await _create_user(test_db)
        qa1 = await _create_qa(test_db, user.id)
        qa2 = await _create_qa(test_db, user.id)

        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa1.id, "type": "useful", "comment": "Good"},
            headers=_auth(token),
        )
        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa2.id, "type": "error", "comment": "Wrong"},
            headers=_auth(token),
        )

        # Act
        response = await async_client.get(
            _FEEDBACK_URL,
            headers=_auth(token),
        )

        # Assert
        data = assert_api_response(response, 200, expected_code=0)
        assert data["total"] == 2
        assert len(data["items"]) == 2
        # Ordered by id desc (newest first)
        assert data["items"][0]["qa_id"] == qa2.id
        assert data["items"][0]["type"] == "error"
        assert data["items"][1]["qa_id"] == qa1.id
        assert data["items"][1]["type"] == "useful"

    async def test_list_feedback_pagination(
        self, async_client, test_db
    ):
        """List feedback with page_size=1 and verify pagination fields."""
        # Arrange: create 2 feedbacks
        user, token = await _create_user(test_db)
        qa1 = await _create_qa(test_db, user.id)
        qa2 = await _create_qa(test_db, user.id)

        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa1.id, "type": "useful"},
            headers=_auth(token),
        )
        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa2.id, "type": "useless"},
            headers=_auth(token),
        )

        # Act — page 1, size 1
        response = await async_client.get(
            _FEEDBACK_URL,
            params={"page": 1, "page_size": 1},
            headers=_auth(token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        assert len(data["items"]) == 1
        assert data["total"] == 2
        assert data["page"] == 1
        assert data["page_size"] == 1
        assert data["total_pages"] == 2
        # Newest first
        assert data["items"][0]["qa_id"] == qa2.id

        # Act — page 2, size 1
        response = await async_client.get(
            _FEEDBACK_URL,
            params={"page": 2, "page_size": 1},
            headers=_auth(token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        assert len(data["items"]) == 1
        assert data["items"][0]["qa_id"] == qa1.id

    async def test_list_feedback_only_own(
        self, async_client, test_db
    ):
        """User can only see their own feedback."""
        # Arrange: student creates QA + feedback
        student, student_token = await _create_user(test_db, role="student", prefix="stu")
        teacher, teacher_token = await _create_user(test_db, role="teacher", prefix="tea")
        qa = await _create_qa(test_db, student.id)

        await async_client.post(
            _FEEDBACK_URL,
            json={"qa_id": qa.id, "type": "useful"},
            headers=_auth(student_token),
        )

        # Act: teacher lists feedback
        response = await async_client.get(
            _FEEDBACK_URL,
            headers=_auth(teacher_token),
        )

        # Assert: teacher sees empty
        data = assert_api_response(response, 200, expected_code=0)
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_feedback_unauthorized_returns_401(
        self, async_client
    ):
        """List feedback without auth token → 401."""
        response = await async_client.get(_FEEDBACK_URL)
        assert response.status_code == 401
