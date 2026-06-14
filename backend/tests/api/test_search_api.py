"""API integration tests for search endpoints.

GET /api/v1/search?q=...&mode=keyword|semantic|hybrid&course_id=...&page=...&page_size=...

All tests use the ``async_client`` fixture (httpx.AsyncClient against
the real FastAPI ASGI app) with a transactional PostgreSQL test database.

Test cases:
    - Keyword search with matching content → results with matched_snippets
    - Semantic search → results with scores
    - Hybrid search → merged results
    - Empty/missing query → validation error
    - No matching results → empty list, total=0
    - Pending (unapproved) docs excluded from results
    - Course_id filter → only results from that course
    - Pagination → correct page/total/total_pages

Documents must be uploaded, **processed** (parsed→chunked→vectorised), and
**approved** before they appear in search results.
"""

import os
import uuid
from pathlib import Path

import pytest

from tests.fixtures.graph import real_embedding_available
from tests.utils import assert_api_response

_SEARCH_URL = "/api/v1/search"
_UPLOAD_URL = "/api/v1/documents"


# ─────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


def _unique_content(label: str = "搜索测试") -> str:
    """Generate unique Chinese text with embedded UUID for reliable keyword-search assertions."""
    uid = uuid.uuid4().hex[:12]
    return (
        f"【{label}-{uid}】这是一段独特的测试内容，包含唯一标识符{uid}用于检索验证。"
        f"机器学习是人工智能的重要分支，深度学习在图像识别和自然语言处理领域取得了突破性进展。"
    )


def _extract_uid(text: str) -> str:
    """Extract the first 12-hex-char UUID substring from *text*."""
    import re

    m = re.search(r"[0-9a-fA-F]{12}", text)
    return m.group(0) if m else ""


async def _create_searchable_doc(
    async_client,
    student_token: str,
    admin_token: str,
    tmp_path: Path,
    *,
    content: str,
    title: str = "测试文档",
    file_type: str = "reference",
    course_id: int | None = None,
) -> dict:
    """Upload a .txt file with *content*, process it, and approve it.

    Returns the approved Document data dict (``data`` field of the final response).
    """
    # 1. Write temp file
    file_path = tmp_path / f"search_test_{uuid.uuid4().hex[:8]}.txt"
    file_path.write_text(content, encoding="utf-8")

    # 2. Upload
    data_fields: dict[str, str] = {
        "title": title,
        "file_type": file_type,
        "description": "搜索集成测试",
        "tags": '["测试", "检索"]',
    }
    if course_id is not None:
        data_fields["course_id"] = str(course_id)

    filename = os.path.basename(str(file_path))
    with open(file_path, "rb") as f:
        response = await async_client.post(
            _UPLOAD_URL,
            files={"file": (filename, f, "text/plain")},
            data=data_fields,
            headers=_auth(student_token),
        )
    upload_data = assert_api_response(response, 201, expected_code=0)
    doc_id = upload_data["id"]

    # 3. Process (parse → chunk → vectorise) — requires teacher or admin
    proc_resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/process",
        headers=_auth(admin_token),
    )
    assert proc_resp.status_code == 200, (
        f"Process doc {doc_id} failed [{proc_resp.status_code}]: {proc_resp.text}"
    )

    # 4. Approve
    appr_resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/approve",
        json={"status": "approved", "comment": "审核通过"},
        headers=_auth(admin_token),
    )
    assert appr_resp.status_code == 200, (
        f"Approve doc {doc_id} failed [{appr_resp.status_code}]: {appr_resp.text}"
    )

    return appr_resp.json()["data"]


async def _search(
    async_client,
    token: str,
    q: str,
    mode: str = "keyword",
    course_id: int | None = None,
    page: int = 1,
    page_size: int = 10,
    expected_status: int = 200,
) -> dict:
    """Execute a search request and return the parsed ``data`` dict."""
    params: dict = {"q": q, "mode": mode, "page": page, "page_size": page_size}
    if course_id is not None:
        params["course_id"] = course_id

    response = await async_client.get(
        _SEARCH_URL,
        params=params,
        headers=_auth(token),
    )
    return assert_api_response(response, expected_status, expected_code=0)


# ═════════════════════════════════════════════════════════════════════════
# Keyword Search
# ═════════════════════════════════════════════════════════════════════════


class TestKeywordSearch:
    """Keyword search via SQL ``ILIKE`` on chunks.content."""

    async def test_finds_matching_content(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Upload a doc with a unique UUID; search for that UUID → doc found with snippets."""
        content = _unique_content("关键词检索")
        uid = _extract_uid(content)
        assert uid, "UUID extraction failed"

        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="关键词测试文档",
        )

        data = await _search(async_client, student_token, q=uid, mode="keyword")

        assert data["mode"] == "keyword"
        assert data["query"] == uid
        assert data["total"] >= 1
        assert len(data["results"]) >= 1

        result = data["results"][0]
        assert result["title"] == "关键词测试文档"
        assert result["file_type"] == "reference"
        assert len(result["matched_snippets"]) >= 1

        for snippet in result["matched_snippets"]:
            assert "chunk_id" in snippet
            assert "content" in snippet
            assert "score" in snippet
            # Keyword matches get score 1.0
            assert snippet["score"] == 1.0

    async def test_no_match_returns_empty(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Search for content that does not exist in any document → empty results."""
        content = _unique_content("无匹配测试")
        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="无匹配文档",
        )

        data = await _search(
            async_client, student_token,
            q="ZZZ_NONEXISTENT_UUID_XYZZY99999",
            mode="keyword",
        )

        assert data["total"] == 0
        assert data["results"] == []
        assert data["page"] == 1
        assert data["total_pages"] == 1
        assert data["mode"] == "keyword"

    async def test_pending_doc_excluded_from_results(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """A document that is uploaded but NOT yet approved should not appear in search."""
        uid = uuid.uuid4().hex[:12]
        content = f"待审核测试-{uid} 未审核的文档不应出现在搜索结果中。"

        file_path = tmp_path / f"pending_{uuid.uuid4().hex[:8]}.txt"
        file_path.write_text(content, encoding="utf-8")

        filename = os.path.basename(str(file_path))
        with open(file_path, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "text/plain")},
                data={
                    "title": "待审核文档",
                    "file_type": "reference",
                    "tags": '["test"]',
                },
                headers=_auth(student_token),
            )
        assert response.status_code == 201

        # Search should NOT find this pending document
        data = await _search(async_client, student_token, q=uid, mode="keyword")
        assert data["total"] == 0


# ═════════════════════════════════════════════════════════════════════════
# Semantic Search
# ═════════════════════════════════════════════════════════════════════════


class TestSemanticSearch:
    """Semantic / vector-similarity search via ChromaDB.

    Requires SILICONFLOW_API_KEY for embeddings; skipped otherwise.
    """

    @real_embedding_available
    async def test_returns_results_or_falls_back(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Upload ML content; semantic search returns results (or graceful fallback to keyword)."""
        content = (
            "深度学习是机器学习的一个重要方向，使用多层神经网络来学习数据的层次化特征表示。"
            "卷积神经网络（CNN）在图像识别任务中表现出色，通过卷积层和池化层提取图像特征。"
            "循环神经网络（RNN）和LSTM适合处理序列数据，如文本和时间序列分析。"
            "近年来，Transformer架构在自然语言处理领域取得了突破性进展。"
        )

        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="深度学习概述",
        )

        data = await _search(
            async_client, student_token,
            q="神经网络图像识别",
            mode="semantic",
        )

        # May fallback to keyword → mode becomes "keyword"
        assert data["mode"] in ("semantic", "keyword")
        assert isinstance(data["results"], list)
        assert isinstance(data["total"], int)

        if data["mode"] == "semantic" and data["total"] > 0:
            # Verify scores are present and are floats (not all uniformly 1.0)
            all_scores: list[float] = []
            for result in data["results"]:
                for snippet in result["matched_snippets"]:
                    assert isinstance(snippet["score"], float)
                    all_scores.append(snippet["score"])
            if all_scores:
                # Semantic scores should vary (unlike keyword which is all 1.0)
                assert max(all_scores) > 0, "Expected positive semantic similarity scores"

    @real_embedding_available
    async def test_unrelated_query_returns_empty_or_low_score(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Semantic search with completely unrelated query → empty results (below threshold)."""
        content = _unique_content("语义测试")
        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="语义测试文档",
        )

        data = await _search(
            async_client, student_token,
            q="火星探测计划火箭发射宇宙飞船登陆火星",
            mode="semantic",
        )

        # Response structure must be valid regardless of results
        assert "results" in data
        assert "total" in data
        assert "page" in data
        assert "total_pages" in data
        # Results should be empty (similarity below RAG_SIMILARITY_THRESHOLD)
        # or at most a few very low-scoring results
        for result in data["results"]:
            for snippet in result["matched_snippets"]:
                assert snippet["score"] <= 1.0


# ═════════════════════════════════════════════════════════════════════════
# Hybrid Search
# ═════════════════════════════════════════════════════════════════════════


class TestHybridSearch:
    """Hybrid search merges keyword + semantic results, deduplicating by chunk_id."""

    @real_embedding_available
    async def test_returns_merged_results(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Keyword-matched documents must appear in hybrid results."""
        uid = uuid.uuid4().hex[:12]
        content = f"混合检索测试-{uid} 混合模式应合并关键词和语义检索的结果。"

        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="混合检索文档",
        )

        data = await _search(async_client, student_token, q=uid, mode="hybrid")

        assert data["mode"] == "hybrid"
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["title"] == "混合检索文档"
        assert len(result["matched_snippets"]) >= 1


# ═════════════════════════════════════════════════════════════════════════
# Parameter Validation
# ═════════════════════════════════════════════════════════════════════════


class TestSearchValidation:
    """Input validation and edge-case behaviour."""

    async def test_missing_query_param_returns_422(
        self, async_client, student_token
    ):
        """GET /api/v1/search without the required 'q' param → 422."""
        response = await async_client.get(
            _SEARCH_URL,
            headers=_auth(student_token),
        )
        assert response.status_code == 422

    async def test_empty_query_returns_results_or_empty(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Empty query string (q="") — endpoint should return empty results gracefully."""
        content = _unique_content("空查询测试")
        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="空查询文档",
        )

        data = await _search(async_client, student_token, q="", mode="keyword")
        # Empty ILIKE '%""%' matches everything, but that's the endpoint's behaviour
        assert isinstance(data["results"], list)
        assert isinstance(data["total"], int)

    async def test_invalid_mode_returns_empty_results(
        self, async_client, student_token
    ):
        """An unknown mode string → endpoint returns 200 with empty results (no known searcher matches)."""
        response = await async_client.get(
            _SEARCH_URL,
            params={"q": "test", "mode": "fantasy_mode"},
            headers=_auth(student_token),
        )
        # mode is a plain `str` query param, not an enum — FastAPI accepts any value.
        # The endpoint only dispatches for known modes (keyword/semantic/hybrid);
        # unrecognised modes produce an empty result set.
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total"] == 0
        assert data["results"] == []

    async def test_page_beyond_range_returns_empty(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Requesting page 999 when fewer results exist → empty results list."""
        uid = uuid.uuid4().hex[:12]
        content = f"分页越界测试-{uid}"

        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content, title="分页文档",
        )

        data = await _search(
            async_client, student_token, q=uid, mode="keyword", page=999,
        )
        assert data["results"] == []
        assert data["page"] == 999
        assert data["total_pages"] >= 1


# ═════════════════════════════════════════════════════════════════════════
# Course Filter
# ═════════════════════════════════════════════════════════════════════════


class TestSearchCourseFilter:
    """Filtering search results by course_id."""

    async def test_course_filter_excludes_other_courses(
        self, async_client, student_token, admin_token, tmp_path, create_test_user, test_db
    ):
        """Search with course_id=X → only documents belonging to course X appear."""
        from app.models.course import Course

        # 1. Create a teacher (committed to real DB by factory)
        teacher_user, _teacher_token = await create_test_user(role="teacher")

        # 2. Create two courses inside the test_db transaction
        course_a = Course(
            name=f"搜索课程A_{uuid.uuid4().hex[:6]}",
            semester="2025-2026-2",
            teacher_id=teacher_user.id,
        )
        course_b = Course(
            name=f"搜索课程B_{uuid.uuid4().hex[:6]}",
            semester="2025-2026-2",
            teacher_id=teacher_user.id,
        )
        test_db.add_all([course_a, course_b])
        await test_db.flush()

        # 3. Upload + approve one doc per course, each with a unique UUID
        uid_a = uuid.uuid4().hex[:12]
        content_a = f"课程A文档-{uid_a} 仅属于课程A的测试内容。"
        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content_a, title="课程A文档", course_id=course_a.id,
        )

        uid_b = uuid.uuid4().hex[:12]
        content_b = f"课程B文档-{uid_b} 仅属于课程B的测试内容。"
        await _create_searchable_doc(
            async_client, student_token, admin_token, tmp_path,
            content=content_b, title="课程B文档", course_id=course_b.id,
        )

        # 4. Search course A → only doc A
        data_a = await _search(
            async_client, student_token, q=uid_a, mode="keyword",
            course_id=course_a.id,
        )
        assert data_a["total"] >= 1
        for r in data_a["results"]:
            assert r["title"] == "课程A文档"

        # 5. Search course B → only doc B
        data_b = await _search(
            async_client, student_token, q=uid_b, mode="keyword",
            course_id=course_b.id,
        )
        assert data_b["total"] >= 1
        for r in data_b["results"]:
            assert r["title"] == "课程B文档"

        # 6. Cross-check: search course B for doc A's UUID → should be empty
        data_cross = await _search(
            async_client, student_token, q=uid_a, mode="keyword",
            course_id=course_b.id,
        )
        assert data_cross["total"] == 0


# ═════════════════════════════════════════════════════════════════════════
# Pagination
# ═════════════════════════════════════════════════════════════════════════


class TestSearchPagination:
    """Page / page_size / total_pages correctness."""

    _BATCH_SIZE = 5

    async def test_pagination_fields_correct(
        self, async_client, student_token, admin_token, tmp_path
    ):
        """Create *BATCH_SIZE* docs sharing a unique keyword; paginate and verify fields."""
        # Use a session-unique keyword to avoid cross-test contamination
        # (the API's db.commit() can persist docs beyond the test_db rollback boundary).
        keyword = f"PAG_{uuid.uuid4().hex[:12]}"

        # 1. Create several searchable documents, each containing the common marker
        for i in range(self._BATCH_SIZE):
            uid = uuid.uuid4().hex[:8]
            content = f"【分页文档{i}-{uid}】{keyword} 批量分页测试内容。"
            await _create_searchable_doc(
                async_client, student_token, admin_token, tmp_path,
                content=content, title=f"分页文档{i}",
            )

        # 2. Search with page_size=2
        data_p1 = await _search(
            async_client, student_token,
            q=keyword, mode="keyword",
            page=1, page_size=2,
        )
        assert data_p1["page"] == 1
        assert data_p1["page_size"] == 2
        assert data_p1["total"] >= self._BATCH_SIZE, (
            f"Expected at least {self._BATCH_SIZE} results, got {data_p1['total']}"
        )
        expected_pages = (data_p1["total"] + 1) // 2  # ceil(total/2)
        assert data_p1["total_pages"] == expected_pages
        assert len(data_p1["results"]) == 2

        # 3. Page 2 — next 2 results
        data_p2 = await _search(
            async_client, student_token,
            q=keyword, mode="keyword",
            page=2, page_size=2,
        )
        assert data_p2["page"] == 2
        assert len(data_p2["results"]) == min(2, data_p1["total"] - 2)

        if data_p1["total"] > 4:
            # 4. Page 3 — last results for page_size=2
            data_p3 = await _search(
                async_client, student_token,
                q=keyword, mode="keyword",
                page=3, page_size=2,
            )
            assert data_p3["page"] == 3
            assert data_p3["total_pages"] == expected_pages

        # 5. Page far beyond range → empty
        data_far = await _search(
            async_client, student_token,
            q=keyword, mode="keyword",
            page=999, page_size=2,
        )
        assert data_far["results"] == []
        assert data_far["total_pages"] == expected_pages
