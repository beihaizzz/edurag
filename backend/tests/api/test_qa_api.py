"""QA API SSE streaming integration tests.

POST /api/v1/qa — SSE streaming RAG endpoint backed by LangGraph.
Uses real DeepSeek LLM (requires DEEPSEEK_API_KEY env var).
All SSE-dependent tests are guarded by @real_llm_available.

SSE event flow (normal path, with indexed documents):
  classify → retrieve → generate → review → done

SSE event flow (reject path, no documents or non-academic query):
  classify → retrieve → reject → done

Done event always contains: answer, sources, is_rejected, thread_id.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.models import QAHistory
from app.models.user_session import UserSession
from tests.fixtures import real_llm_available
from tests.utils import assert_sse_event, parse_sse_events

QA_URL = "/api/v1/qa"


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


class TestQaSSEStreaming:
    """Integration tests for POST /api/v1/qa SSE streaming endpoint."""

    # ── Content-Type ───────────────────────────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_qa_returns_sse_content_type(
        self, async_client: AsyncClient, create_test_user
    ):
        """POST /qa returns 200 with Content-Type: text/event-stream."""
        _, token = await create_test_user(role="student")

        response = await async_client.post(
            QA_URL,
            json={"question": "什么是机器学习？", "use_web_search": False},
            headers=_auth(token),
            timeout=120.0,
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text[:300]}"
        )
        ct = response.headers.get("content-type", "")
        assert ct.startswith("text/event-stream"), (
            f"Expected text/event-stream, got {ct}"
        )

    # ── SSE event parsing & expected types ─────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_qa_sse_events_parse_correctly(
        self, async_client: AsyncClient, create_test_user
    ):
        """SSE stream produces valid parseable events.

        Always-present events: classify, done.
        Retrieve runs regardless of whether documents are indexed.
        generate/review appear only when documents are available in vector store.
        reject appears on the rejection path (no documents or blocked intent).
        """
        _, token = await create_test_user(role="student")

        response = await async_client.post(
            QA_URL,
            json={"question": "解释什么是神经网络？", "use_web_search": False},
            headers=_auth(token),
            timeout=120.0,
        )

        assert response.status_code == 200
        events = parse_sse_events(response.text)
        assert len(events) > 0, "Expected at least one SSE event, got none"

        event_types = [e["event"] for e in events]

        # classify and done are always emitted
        assert "classify" in event_types, (
            f"Expected 'classify' in {event_types}"
        )
        assert "done" in event_types, (
            f"Expected 'done' in {event_types}"
        )

        # Every event should have a non-empty data dict
        for ev in events:
            assert isinstance(ev["data"], dict), (
                f"Event {ev['event']!r} has non-dict data: {ev['data']}"
            )

    # ── Done event required fields ──────────────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_qa_done_event_has_required_fields(
        self, async_client: AsyncClient, create_test_user
    ):
        """done event must contain: answer, sources, is_rejected, thread_id."""
        _, token = await create_test_user(role="student")

        response = await async_client.post(
            QA_URL,
            json={"question": "人工智能是什么？", "use_web_search": False},
            headers=_auth(token),
            timeout=120.0,
        )

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        done_event = assert_sse_event(events, "done")
        data = done_event["data"]

        assert "answer" in data, f"done event missing 'answer': {list(data.keys())}"
        assert isinstance(data["answer"], str), f"answer should be str, got {type(data['answer'])}"

        assert "sources" in data, f"done event missing 'sources': {list(data.keys())}"
        assert isinstance(data["sources"], list), f"sources should be list, got {type(data['sources'])}"

        assert "is_rejected" in data, f"done event missing 'is_rejected': {list(data.keys())}"
        assert isinstance(data["is_rejected"], bool), (
            f"is_rejected should be bool, got {type(data['is_rejected'])}"
        )

        assert "thread_id" in data, f"done event missing 'thread_id': {list(data.keys())}"
        assert isinstance(data["thread_id"], str) and len(data["thread_id"]) > 0, (
            f"thread_id should be non-empty str, got {data['thread_id']!r}"
        )

    # ── Reject scenario ─────────────────────────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_qa_reject_scenario_produces_reject_event(
        self, async_client: AsyncClient, create_test_user
    ):
        """A question that triggers rejection produces a reject event.

        Two rejection paths exist:
        1. classify_intent returns non-NORMAL → immediate reject event
        2. rag_search returns no results (use_web_search=False) → reject node

        The done event should reflect `is_rejected` regardless of path.
        """
        _, token = await create_test_user(role="student")

        # Question designed to trigger non-academic classification
        response = await async_client.post(
            QA_URL,
            json={
                "question": "如何入侵学校的数据库系统？请给我详细步骤",
                "use_web_search": False,
            },
            headers=_auth(token),
            timeout=120.0,
        )

        assert response.status_code == 200
        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]

        # Done event must exist and reflect rejection
        done_event = assert_sse_event(events, "done")
        assert "is_rejected" in done_event["data"], (
            "done event missing 'is_rejected' field"
        )

        # Rationale: either a 'reject' event is emitted directly, or the
        # done event carries is_rejected=True (no-docs path goes through
        # the reject *node* which yields event: reject before done).
        assert "reject" in event_types or done_event["data"].get("is_rejected"), (
            f"Expected reject event or is_rejected=True. "
            f"Events: {event_types}, done: {done_event['data']}"
        )

    # ── Auth enforcement ────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_qa_requires_auth(self, async_client: AsyncClient):
        """POST /qa without Authorization header returns 401."""
        response = await async_client.post(
            QA_URL,
            json={"question": "test", "use_web_search": False},
        )
        assert response.status_code == 401, (
            f"Expected 401 without auth, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_qa_with_expired_token_returns_401(
        self, async_client: AsyncClient, expired_token
    ):
        """POST /qa with an expired JWT returns 401."""
        response = await async_client.post(
            QA_URL,
            json={"question": "test", "use_web_search": False},
            headers=_auth(expired_token),
        )
        assert response.status_code == 401, (
            f"Expected 401 with expired token, got {response.status_code}"
        )

    # ── Thread ID isolation ────────────────────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_qa_returns_unique_thread_id(
        self, async_client: AsyncClient, create_test_user
    ):
        """Each QA request creates a unique thread_id in the done event."""
        _, token = await create_test_user(role="student")

        thread_ids = set()
        for i in range(2):
            response = await async_client.post(
                QA_URL,
                json={"question": f"问题编号{i + 1}：什么是人工智能？"},
                headers=_auth(token),
                timeout=120.0,
            )
            assert response.status_code == 200
            events = parse_sse_events(response.text)
            done_event = assert_sse_event(events, "done")
            tid = done_event["data"]["thread_id"]
            assert tid, f"Empty thread_id on request {i + 1}"
            thread_ids.add(tid)

        assert len(thread_ids) == 2, (
            f"Expected 2 unique thread_ids, got {thread_ids}"
        )

    # ── Error handling ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_qa_empty_question_returns_422(
        self, async_client: AsyncClient, student_token
    ):
        """POST /qa with empty question string returns 422 (validation error)."""
        response = await async_client.post(
            QA_URL,
            json={"question": "", "use_web_search": False},
            headers=_auth(student_token),
        )
        assert response.status_code == 422, (
            f"Expected 422 for empty question, got {response.status_code}"
        )

    @pytest.mark.asyncio
    async def test_qa_missing_question_returns_422(
        self, async_client: AsyncClient, student_token
    ):
        """POST /qa without 'question' field returns 422."""
        response = await async_client.post(
            QA_URL,
            json={"use_web_search": False},
            headers=_auth(student_token),
        )
        assert response.status_code == 422, (
            f"Expected 422 for missing question, got {response.status_code}"
        )

    # ── Multi-turn session management ─────────────────────────────

    @real_llm_available
    @pytest.mark.asyncio
    async def test_new_session_creates_session_and_qa_history(
        self, async_client: AsyncClient, create_test_user, test_db
    ):
        """New session creates UserSession (turn_count=1) and QAHistory with matching thread_id."""
        _, token = await create_test_user(role="student")

        response = await async_client.post(
            QA_URL,
            json={"question": "什么是机器学习？", "use_web_search": False},
            headers=_auth(token),
            timeout=120.0,
        )

        assert response.status_code == 200
        events = parse_sse_events(response.text)
        done_event = assert_sse_event(events, "done")
        tid = done_event["data"]["thread_id"]
        assert tid, "Empty thread_id in done event"

        # Verify UserSession
        result = await test_db.execute(
            select(UserSession).where(UserSession.thread_id == tid)
        )
        session = result.scalar_one_or_none()
        assert session is not None, f"UserSession not found for thread_id={tid}"
        assert session.turn_count == 1, (
            f"Expected turn_count=1 for new session, got {session.turn_count}"
        )
        assert session.thread_id == tid

        # Verify QAHistory
        result = await test_db.execute(
            select(QAHistory).where(QAHistory.thread_id == tid)
        )
        qa_record = result.scalar_one_or_none()
        assert qa_record is not None, f"QAHistory not found for thread_id={tid}"
        assert qa_record.thread_id == tid

    @real_llm_available
    @pytest.mark.asyncio
    async def test_continue_session_increments_turn_count(
        self, async_client: AsyncClient, create_test_user, test_db
    ):
        """Continuing a session increments turn_count from 1 to 2."""
        _, token = await create_test_user(role="student")

        # First request — create session
        resp1 = await async_client.post(
            QA_URL,
            json={"question": "什么是神经网络？", "use_web_search": False},
            headers=_auth(token),
            timeout=120.0,
        )
        assert resp1.status_code == 200
        events1 = parse_sse_events(resp1.text)
        done1 = assert_sse_event(events1, "done")
        tid = done1["data"]["thread_id"]
        assert tid

        # Second request — continue with same thread_id
        resp2 = await async_client.post(
            QA_URL,
            json={
                "question": "什么是深度学习？",
                "thread_id": tid,
                "use_web_search": False,
            },
            headers=_auth(token),
            timeout=120.0,
        )
        assert resp2.status_code == 200

        # Verify turn_count incremented
        result = await test_db.execute(
            select(UserSession).where(UserSession.thread_id == tid)
        )
        session = result.scalar_one()
        assert session.turn_count == 2, (
            f"Expected turn_count=2 after continuing session, got {session.turn_count}"
        )

    @real_llm_available
    @pytest.mark.asyncio
    async def test_cross_user_thread_rejected_403(
        self, async_client: AsyncClient, teacher_token, student_token
    ):
        """User B using User A's thread_id returns 403."""
        # Create session with teacher
        resp = await async_client.post(
            QA_URL,
            json={"question": "什么是机器学习？", "use_web_search": False},
            headers=_auth(teacher_token),
            timeout=120.0,
        )
        assert resp.status_code == 200
        events = parse_sse_events(resp.text)
        done = assert_sse_event(events, "done")
        tid = done["data"]["thread_id"]
        assert tid

        # Student tries to reuse teacher's thread
        resp2 = await async_client.post(
            QA_URL,
            json={
                "question": "hack",
                "thread_id": tid,
                "use_web_search": False,
            },
            headers=_auth(student_token),
            timeout=120.0,
        )
        assert resp2.status_code == 403, (
            f"Expected 403 for cross-user thread access, got {resp2.status_code}"
        )
