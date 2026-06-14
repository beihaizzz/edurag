"""Vector Store Service unit tests — ChromaDB embedding storage and semantic search.

Tests the module-level singleton ``vector_store`` (VectorStoreService) for:
- Chunk storage and semantic retrieval
- Similarity scoring accuracy
- Top-K result limiting
- Metadata filtering (course_id)
- Edge cases (empty inputs, empty query)
- Document-level deletion

Requires a valid SILICONFLOW_API_KEY (skipped otherwise via
``@real_embedding_available`` marker).
"""

import pytest
import pytest_asyncio

from app.core.config import settings
from app.services.vector_store import vector_store
from tests.fixtures import real_embedding_available


class TestVectorStoreBasic:
    """Core add_chunks + search + delete functionality."""

    # ── Unique document IDs to avoid collisions with production data ──
    DOC_AI = 99901       # 机器学习 / AI
    DOC_DS = 99902       # 数据结构
    DOC_HISTORY = 99903  # 历史
    DOC_DELETE = 99909   # Used by test_delete_by_document

    # All IDs that the autouse-cleanup teardown will purge
    _CLEANUP_IDS = [DOC_AI, DOC_DS, DOC_HISTORY, DOC_DELETE]

    # ═══════════════════════════════════════════════════════════════════
    # Fixtures
    # ═══════════════════════════════════════════════════════════════════

    @pytest_asyncio.fixture(autouse=True)
    async def cleanup(self):
        """Remove test chunks after every test to avoid cross-test contamination."""
        yield
        for doc_id in self._CLEANUP_IDS:
            try:
                await vector_store.delete_by_document(doc_id)
            except Exception:
                pass

    # ═══════════════════════════════════════════════════════════════════
    # Helper
    # ═══════════════════════════════════════════════════════════════════

    @staticmethod
    def _make_chunk(
        chunk_id: int,
        document_id: int,
        content: str,
        course_id: int = 101,
    ) -> dict:
        """Factory for a chunk dict accepted by add_chunks()."""
        return {
            "chunk_id": chunk_id,
            "document_id": document_id,
            "content": content,
            "metadata": {"course_id": course_id},
        }

    # ═══════════════════════════════════════════════════════════════════
    # Tests
    # ═══════════════════════════════════════════════════════════════════

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_store_and_retrieve(self):
        """Chunks can be stored and retrieved via semantic search."""
        chunks = [
            self._make_chunk(90001, self.DOC_AI,
                             "机器学习是人工智能的核心分支，关注算法和数据驱动的模式识别"),
            self._make_chunk(90002, self.DOC_DS,
                             "数据结构包括数组、链表、栈、队列、树和图等基本结构", course_id=102),
            self._make_chunk(90003, self.DOC_HISTORY,
                             "古代中国历史可以追溯到夏商周时期，秦汉统一奠定了中华文明基础", course_id=103),
        ]
        await vector_store.add_chunks(chunks)

        results = await vector_store.search("什么是机器学习", top_k=3)
        assert len(results) > 0, "Should return at least one result"

        # The ML chunk should be the top (most semantically relevant) result
        assert results[0]["document_id"] == self.DOC_AI, (
            f"Expected ML doc {self.DOC_AI} as top result, "
            f"got document_id={results[0]['document_id']}"
        )
        assert results[0]["score"] >= settings.RAG_SIMILARITY_THRESHOLD, (
            f"Top ML result score {results[0]['score']} "
            f"should be >= {settings.RAG_SIMILARITY_THRESHOLD}"
        )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_semantic_similarity_scoring(self):
        """Semantically related queries yield higher scores than unrelated ones."""
        chunks = [
            self._make_chunk(90011, self.DOC_AI,
                             "机器学习是人工智能的核心分支，关注算法和数据驱动的模式识别"),
            self._make_chunk(90012, self.DOC_DS,
                             "数据结构包括数组、链表、栈、队列、树和图等基本结构", course_id=102),
        ]
        await vector_store.add_chunks(chunks)

        # Related query — should strongly match the ML chunk
        ml_results = await vector_store.search("人工智能和算法", top_k=2)
        assert len(ml_results) > 0, "ML-related query should return results"

        ml_top_score = ml_results[0]["score"]
        assert ml_top_score >= settings.RAG_SIMILARITY_THRESHOLD, (
            f"Semantically related result score {ml_top_score} "
            f"should be >= {settings.RAG_SIMILARITY_THRESHOLD}"
        )

        # Unrelated query — should produce low scores (below threshold) or empty
        unrelated_results = await vector_store.search("今天天气怎么样", top_k=2)
        if unrelated_results:
            assert unrelated_results[0]["score"] < settings.RAG_SIMILARITY_THRESHOLD, (
                f"Unrelated query top score {unrelated_results[0]['score']} "
                f"should be < {settings.RAG_SIMILARITY_THRESHOLD}"
            )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_top_k_limit(self):
        """Requesting top_k=3 returns at most 3 results."""
        chunks = [
            self._make_chunk(
                90021 + i, self.DOC_AI,
                f"机器学习知识点第{i}章：涵盖各种算法和理论知识内容",
            )
            for i in range(5)
        ]
        await vector_store.add_chunks(chunks)

        results = await vector_store.search("机器学习算法", top_k=3)
        assert len(results) <= 3, f"Expected ≤3 results, got {len(results)}"
        assert len(results) > 0, "Should return at least one result"

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_course_id_filter(self):
        """where_filter by course_id returns only matching documents."""
        chunks = [
            self._make_chunk(90031, self.DOC_AI,
                             "深度学习使用多层神经网络进行特征提取", course_id=101),
            self._make_chunk(90032, self.DOC_DS,
                             "二叉搜索树是一种高效的数据查找结构", course_id=102),
        ]
        await vector_store.add_chunks(chunks)

        results = await vector_store.search(
            "学习", top_k=5, where_filter={"course_id": 101},
        )
        assert len(results) > 0, "Should find results for course 101"

        for r in results:
            actual_course_id = r.get("metadata", {}).get("course_id")
            assert actual_course_id == 101, (
                f"Result document_id={r['document_id']} has "
                f"course_id={actual_course_id}, expected 101"
            )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_empty_chunks_no_crash(self):
        """add_chunks([]) should not crash or raise."""
        await vector_store.add_chunks([])  # no-op, must not raise

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_empty_query_no_crash(self):
        """search(\"\") should not crash."""
        results = await vector_store.search("", top_k=3)
        assert isinstance(results, list), "Should return a list (possibly empty)"

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_similarity_threshold_boundary(self):
        """Results below RAG_SIMILARITY_THRESHOLD have appropriately low scores."""
        chunks = [
            self._make_chunk(90041, self.DOC_AI,
                             "机器学习是人工智能的核心分支，关注算法和数据"),
            self._make_chunk(90042, self.DOC_HISTORY,
                             "中国历史从夏商周开始经历了几千年的发展", course_id=103),
        ]
        await vector_store.add_chunks(chunks)

        # Relevant query → top result above threshold
        results = await vector_store.search("什么是机器学习算法", top_k=2)
        assert len(results) > 0
        assert results[0]["score"] >= settings.RAG_SIMILARITY_THRESHOLD, (
            f"Top result score {results[0]['score']} "
            f"should be >= {settings.RAG_SIMILARITY_THRESHOLD}"
        )

        # Completely unrelated query → all results below threshold
        unrelated = await vector_store.search("今天晚餐吃什么", top_k=2)
        for r in unrelated:
            assert r["score"] < settings.RAG_SIMILARITY_THRESHOLD, (
                f"Unrelated result score {r['score']} "
                f"should be < {settings.RAG_SIMILARITY_THRESHOLD}"
            )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_delete_by_document(self):
        """After delete_by_document, search no longer returns deleted content."""
        chunks = [
            self._make_chunk(90051, self.DOC_DELETE,
                             "这段内容应该被删除，测试删除功能是否正常工作"),
        ]
        await vector_store.add_chunks(chunks)

        # Verify stored
        results_before = await vector_store.search("删除功能", top_k=3)
        doc_ids_before = {r["document_id"] for r in results_before}
        assert self.DOC_DELETE in doc_ids_before, (
            f"Chunk for doc {self.DOC_DELETE} should exist before deletion"
        )

        # Delete
        deleted_count = await vector_store.delete_by_document(self.DOC_DELETE)
        assert deleted_count >= 1, (
            f"Should delete at least 1 chunk, got {deleted_count}"
        )

        # Verify gone
        results_after = await vector_store.search("删除功能", top_k=10)
        doc_ids_after = {r["document_id"] for r in results_after}
        assert self.DOC_DELETE not in doc_ids_after, (
            "Deleted chunk should not appear in search results"
        )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_search_result_structure(self):
        """Each search result contains expected keys with correct types."""
        chunks = [
            self._make_chunk(90061, self.DOC_AI,
                             "支持向量机是一种经典的监督学习分类算法"),
        ]
        await vector_store.add_chunks(chunks)

        results = await vector_store.search("SVM分类器", top_k=1)
        assert len(results) == 1

        r = results[0]
        assert isinstance(r["chunk_id"], int), "chunk_id should be int"
        assert isinstance(r["document_id"], int), "document_id should be int"
        assert isinstance(r["content"], str), "content should be str"
        assert isinstance(r["score"], float), "score should be float"
        assert isinstance(r["metadata"], dict), "metadata should be dict"
        assert 0.0 <= r["score"] <= 1.0, (
            f"Score {r['score']} should be in [0, 1]"
        )


class TestVectorStoreEdgeCases:
    """Additional edge-case coverage independent of the basic test data."""

    DOC_EDGE = 99910
    _CLEANUP_IDS = [DOC_EDGE]

    @pytest_asyncio.fixture(autouse=True)
    async def cleanup(self):
        yield
        for doc_id in self._CLEANUP_IDS:
            try:
                await vector_store.delete_by_document(doc_id)
            except Exception:
                pass

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_health_check(self):
        """health_check() returns True when ChromaDB is reachable."""
        ok = await vector_store.health_check()
        assert ok is True, "Health check should succeed"

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_delete_nonexistent_document(self):
        """delete_by_document on a non-existent ID returns 0."""
        count = await vector_store.delete_by_document(99999999)
        assert count == 0, (
            f"Deleting non-existent doc should return 0, got {count}"
        )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_search_with_no_matching_data(self):
        """Search on a collection with no matching content returns empty list."""
        # Ensure no data exists for the edge doc
        results = await vector_store.search(
            "量子计算", top_k=5, where_filter={"course_id": 999},
        )
        assert results == [], (
            f"Expected empty results, got {len(results)} items"
        )

    @real_embedding_available
    @pytest.mark.asyncio
    async def test_large_top_k_respected(self):
        """top_k larger than stored documents returns only the stored matches via filter."""
        chunks = [
            {
                "chunk_id": 90071 + i,
                "document_id": self.DOC_EDGE,
                "content": f"测试内容片段{i}：这是一段关于计算机科学的教育文本",
                "metadata": {"course_id": 300},
            }
            for i in range(3)
        ]
        await vector_store.add_chunks(chunks)

        # Use document_id filter to isolate our test data from other tests
        # (the ChromaDB collection is shared across the test suite)
        results = await vector_store.search(
            "计算机科学", top_k=100,
            where_filter={"document_id": self.DOC_EDGE},
        )
        assert len(results) <= 3, (
            f"Should return at most 3 (stored count), got {len(results)}"
        )
        assert len(results) > 0, "Should return at least one result"
