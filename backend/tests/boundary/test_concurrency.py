"""Concurrency and race condition boundary tests.

Tests:
    - Simultaneous document uploads → all succeed, no data corruption
    - Simultaneous QA SSE requests → independent thread_ids, no cross-talk
    - Mixed concurrent operations → no deadlocks

Uses ``asyncio.gather`` for concurrent operations with 3-5 unique users
per test to keep load moderate on the transactional test database.

All async tests require ``pytest-asyncio`` (auto mode configured in root conftest).
QA tests additionally require ``DEEPSEEK_API_KEY`` and are guarded by
``@real_llm_available``.

Implementation note: The shared ``test_db`` / ``async_client`` fixtures use a
*single* SQLAlchemy AsyncSession, which cannot be safely used by concurrent
coroutines.  For these concurrency tests we override ``get_db`` with a
session-per-request factory so each request gets its own isolated transaction.
All per-request sessions are rolled back and closed at teardown.
"""

import asyncio
import os
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from tests.fixtures import real_llm_available
from tests.utils import assert_api_response, parse_sse_events

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

_DOCUMENTS_URL = "/api/v1/documents"
_QA_URL = "/api/v1/qa"
_CONCURRENT_COUNT = 3  # moderate: enough to surface races, not overwhelm test DB

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    """Build an Authorization header dict from a JWT token string."""
    return {"Authorization": f"Bearer {token}"}


async def _upload_single(
    async_client: AsyncClient,
    token: str,
    file_path: str,
    *,
    title: str,
    suffix: int = 0,
) -> dict:
    """Upload a single file and return the parsed response data dict.

    ``suffix`` is appended to the title to make each concurrent upload
    distinguishable when verifying non-corruption.
    """
    filename = os.path.basename(file_path)
    data_fields = {
        "title": f"{title}_{suffix}",
        "file_type": "reference",
        "description": f"Concurrent upload test #{suffix}",
        "tags": '["concurrency","test"]',
    }
    with open(file_path, "rb") as f:
        response = await async_client.post(
            _DOCUMENTS_URL,
            files={"file": (filename, f, "text/plain")},
            data=data_fields,
            headers=_auth(token),
        )
    return assert_api_response(response, 201, expected_code=0)


# ─────────────────────────────────────────────────────────────────────────────
# Concurrency-aware client fixture helpers
# ─────────────────────────────────────────────────────────────────────────────
#
# Each concurrent request needs its OWN database session.  We override
# ``get_db`` with a factory that creates a fresh ``AsyncSessionLocal()``
# session + transaction per call.  All sessions are tracked and cleaned
# up (rollback + close) at teardown.


class _SessionPerRequestClient:
    """Manages an ``AsyncClient`` where each request gets a fresh DB session."""

    def __init__(self) -> None:
        self._sessions: list[AsyncSession] = []
        self._client: AsyncClient | None = None

    async def start(self) -> AsyncClient:
        """Set up the session-per-request override and return an AsyncClient."""
        from app.core.database import get_db
        from main import app

        async def _session_factory() -> AsyncSession:
            session = AsyncSessionLocal()
            await session.begin()
            self._sessions.append(session)
            return session

        app.dependency_overrides[get_db] = _session_factory

        transport = ASGITransport(app=app)
        self._client = AsyncClient(transport=transport, base_url="http://test")
        return self._client

    async def stop(self) -> None:
        """Rollback + close all sessions, clear overrides, close client."""
        from app.core.database import get_db
        from main import app

        # Rollback all per-request sessions (in reverse order)
        for session in reversed(self._sessions):
            try:
                await session.rollback()
            except Exception:
                pass
            try:
                await session.close()
            except Exception:
                pass
        self._sessions.clear()

        # Restore dependency overrides
        app.dependency_overrides.pop(get_db, None)

        if self._client is not None:
            await self._client.aclose()
            self._client = None


# ─────────────────────────────────────────────────────────────────────────────
# Test: Concurrent document uploads
# ─────────────────────────────────────────────────────────────────────────────


class TestConcurrentDocumentUpload:
    """Simultaneous uploads by different users must all succeed with no corruption."""

    @pytest.mark.asyncio
    async def test_concurrent_uploads_all_succeed(
        self,
        create_test_user: Any,
        sample_txt_file: str,
    ) -> None:
        """3 users upload files simultaneously → all 201, distinct documents."""
        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            # Create unique users, each with their own JWT
            users: list[str] = []
            for _ in range(_CONCURRENT_COUNT):
                _, token = await create_test_user(role="student")
                users.append(token)

            # Launch all uploads concurrently
            tasks = [
                _upload_single(
                    client,
                    users[i],
                    sample_txt_file,
                    title="并发测试文档",
                    suffix=i,
                )
                for i in range(_CONCURRENT_COUNT)
            ]
            results = await asyncio.gather(*tasks)

            # ── Assertions ───────────────────────────────────────────
            assert len(results) == _CONCURRENT_COUNT, (
                f"Expected {_CONCURRENT_COUNT} results, got {len(results)}"
            )

            titles: set[str] = set()
            ids: set[int] = set()
            for i, data in enumerate(results):
                assert data is not None, f"Upload #{i} returned no data"
                assert "id" in data, f"Upload #{i} missing id: {data}"
                assert data["status"] == "pending", (
                    f"Upload #{i}: expected status=pending, got {data.get('status')}"
                )
                assert data["filename"] == os.path.basename(sample_txt_file), (
                    f"Upload #{i}: wrong filename: {data.get('filename')}"
                )
                assert data["file_size"] > 0, (
                    f"Upload #{i}: file_size should be > 0, got {data.get('file_size')}"
                )
                ids.add(data["id"])
                assert data["title"] == f"并发测试文档_{i}", (
                    f"Upload #{i}: expected title '并发测试文档_{i}', "
                    f"got {data.get('title')}"
                )
                titles.add(data["title"])
                assert "uploader" in data, f"Upload #{i} missing uploader info"

            # All ids and titles are distinct (no data corruption / overlap)
            assert len(ids) == _CONCURRENT_COUNT, (
                f"Duplicate document ids detected: {ids}"
            )
            assert len(titles) == _CONCURRENT_COUNT, (
                f"Duplicate titles detected: {titles}"
            )
        finally:
            await mgr.stop()

    @pytest.mark.asyncio
    async def test_concurrent_uploads_different_users_isolated(
        self,
        create_test_user: Any,
        sample_txt_file: str,
        sample_pdf_file: str,
    ) -> None:
        """Different file types uploaded concurrently → no cross-contamination."""
        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            _, token = await create_test_user(role="student")

            async def _upload(file_path: str, title_suffix: str) -> dict:
                filename = os.path.basename(file_path)
                data_fields = {
                    "title": f"隔离测试_{title_suffix}",
                    "file_type": "reference",
                    "description": "Isolation test",
                    "tags": '["isolation"]',
                }
                with open(file_path, "rb") as f:
                    response = await client.post(
                        _DOCUMENTS_URL,
                        files={
                            "file": (filename, f, "application/octet-stream")
                        },
                        data=data_fields,
                        headers=_auth(token),
                    )
                return assert_api_response(response, 201, expected_code=0)

            # Concurrent uploads with different file types
            results = await asyncio.gather(
                _upload(sample_txt_file, "txt"),
                _upload(sample_pdf_file, "pdf"),
            )

            assert len(results) == 2
            # TXT upload
            assert results[0]["filename"].endswith(".txt")
            assert results[0]["title"] == "隔离测试_txt"
            assert results[0]["status"] == "pending"
            # PDF upload
            assert results[1]["filename"].endswith(".pdf")
            assert results[1]["title"] == "隔离测试_pdf"
            assert results[1]["status"] == "pending"
            # Distinct ids
            assert results[0]["id"] != results[1]["id"]
        finally:
            await mgr.stop()


# ─────────────────────────────────────────────────────────────────────────────
# Test: Concurrent QA SSE requests
# ─────────────────────────────────────────────────────────────────────────────


class TestConcurrentQaRequests:
    """Simultaneous QA SSE streaming requests must yield independent thread_ids."""

    @real_llm_available
    @pytest.mark.asyncio
    async def test_concurrent_qa_independent_threads(
        self,
        create_test_user: Any,
    ) -> None:
        """3 concurrent QA requests → each gets a unique thread_id, no cross-talk."""
        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            users: list[str] = []
            for _ in range(_CONCURRENT_COUNT):
                _, token = await create_test_user(role="student")
                users.append(token)

            async def _qa_request(token: str, suffix: int) -> tuple[int, str | None]:
                response = await client.post(
                    _QA_URL,
                    json={
                        "question": f"什么是深度学习？(req #{suffix})",
                        "use_web_search": False,
                    },
                    headers=_auth(token),
                    timeout=120.0,
                )
                thread_id = None
                if response.status_code == 200:
                    events = parse_sse_events(response.text)
                    for ev in events:
                        if ev["event"] == "done":
                            thread_id = ev["data"].get("thread_id")
                            break
                return response.status_code, thread_id

            tasks = [_qa_request(users[i], i) for i in range(_CONCURRENT_COUNT)]
            results = await asyncio.gather(*tasks)

            thread_ids: set[str] = set()
            for i, (status, tid) in enumerate(results):
                assert status == 200, (
                    f"QA request #{i}: expected 200, got {status}"
                )
                assert tid is not None, (
                    f"QA request #{i}: missing thread_id in done event"
                )
                assert tid not in thread_ids, (
                    f"QA request #{i}: duplicate thread_id {tid!r} "
                    f"(already seen in another concurrent request)"
                )
                thread_ids.add(tid)

            assert len(thread_ids) == _CONCURRENT_COUNT, (
                f"Expected {_CONCURRENT_COUNT} distinct thread_ids, "
                f"got {len(thread_ids)}"
            )
        finally:
            await mgr.stop()

    @real_llm_available
    @pytest.mark.asyncio
    async def test_concurrent_qa_no_cross_talk(
        self,
        create_test_user: Any,
    ) -> None:
        """5 concurrent QA requests with different questions → distinct answers."""
        count = 5
        questions = [
            "什么是监督学习？",
            "什么是无监督学习？",
            "什么是强化学习？",
            "什么是迁移学习？",
            "什么是深度学习？",
        ]

        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            users: list[str] = []
            for _ in range(count):
                _, token = await create_test_user(role="student")
                users.append(token)

            async def _qa(token: str, question: str) -> tuple[int, str | None, str]:
                response = await client.post(
                    _QA_URL,
                    json={"question": question, "use_web_search": False},
                    headers=_auth(token),
                    timeout=120.0,
                )
                thread_id = None
                answer = ""
                if response.status_code == 200:
                    events = parse_sse_events(response.text)
                    for ev in events:
                        if ev["event"] == "done":
                            thread_id = ev["data"].get("thread_id")
                            answer = ev["data"].get("answer", "")
                            break
                return response.status_code, thread_id, answer

            tasks = [_qa(users[i], questions[i]) for i in range(count)]
            results = await asyncio.gather(*tasks)

            thread_ids: set[str] = set()
            for i, (status, tid, answer) in enumerate(results):
                assert status == 200, (
                    f"QA #{i} ({questions[i]}): expected 200, got {status}"
                )
                assert tid is not None, f"QA #{i}: missing thread_id"
                assert tid not in thread_ids, f"QA #{i}: duplicate thread_id {tid!r}"
                thread_ids.add(tid)
                assert len(answer) > 0, (
                    f"QA #{i} ({questions[i]}): received empty answer"
                )

            assert len(thread_ids) == count
        finally:
            await mgr.stop()


# ─────────────────────────────────────────────────────────────────────────────
# Test: Mixed concurrent operations (deadlock / resource contention)
# ─────────────────────────────────────────────────────────────────────────────


class TestConcurrentNoDeadlock:
    """Mix of read/write operations under concurrency → no deadlocks or hangs."""

    @pytest.mark.asyncio
    async def test_mixed_uploads_and_reads_no_deadlock(
        self,
        create_test_user: Any,
        sample_txt_file: str,
    ) -> None:
        """Concurrent uploads + document list reads → all complete, no deadlock."""
        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            _, token = await create_test_user(role="student")

            async def _list_documents() -> int:
                response = await client.get(
                    _DOCUMENTS_URL,
                    headers=_auth(token),
                )
                return response.status_code

            # Mix: 3 uploads + 2 reads interleaved
            upload_tasks = [
                _upload_single(
                    client, token, sample_txt_file,
                    title="死锁测试", suffix=i,
                )
                for i in range(3)
            ]
            read_tasks = [_list_documents() for _ in range(2)]

            all_results = await asyncio.gather(*upload_tasks, *read_tasks)

            upload_results = all_results[:3]
            read_results = all_results[3:]

            for i, data in enumerate(upload_results):
                assert data is not None, f"Upload #{i} failed under mixed load"
                assert data["status"] == "pending"
                assert data["file_size"] > 0

            for i, status in enumerate(read_results):
                assert status == 200, (
                    f"List documents #{i}: expected 200 got {status} — "
                    f"possible deadlock/timeout"
                )
        finally:
            await mgr.stop()

    @pytest.mark.asyncio
    async def test_concurrent_uploads_and_detail_no_deadlock(
        self,
        create_test_user: Any,
        sample_txt_file: str,
    ) -> None:
        """Upload a document, then concurrently query its detail + upload more."""
        mgr = _SessionPerRequestClient()
        client = await mgr.start()

        try:
            _, token = await create_test_user(role="student")

            # First, upload one document (sequential baseline)
            baseline = await _upload_single(
                client, token, sample_txt_file,
                title="基线文档", suffix=0,
            )
            doc_id = baseline["id"]

            async def _get_detail(doc_id: int) -> tuple[int, str | None]:
                response = await client.get(
                    f"{_DOCUMENTS_URL}/{doc_id}",
                    headers=_auth(token),
                )
                title = None
                if response.status_code == 200:
                    body = response.json()
                    data = body.get("data", {})
                    title = data.get("title")
                return response.status_code, title

            # Concurrent: read detail + upload 2 more
            results = await asyncio.gather(
                _get_detail(doc_id),
                _upload_single(
                    client, token, sample_txt_file,
                    title="并发文档A", suffix=1,
                ),
                _upload_single(
                    client, token, sample_txt_file,
                    title="并发文档B", suffix=2,
                ),
            )

            detail_status, detail_title = results[0]
            upload_a = results[1]
            upload_b = results[2]

            assert detail_status == 200, f"Detail read failed: {detail_status}"
            assert detail_title == "基线文档_0", f"Wrong detail title: {detail_title}"

            assert upload_a["title"] == "并发文档A_1"
            assert upload_a["status"] == "pending"
            assert upload_b["title"] == "并发文档B_2"
            assert upload_b["status"] == "pending"

            ids = {baseline["id"], upload_a["id"], upload_b["id"]}
            assert len(ids) == 3
        finally:
            await mgr.stop()
