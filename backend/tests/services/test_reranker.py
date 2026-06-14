"""Reranker Service unit tests — mocked httpx.AsyncClient.

Tests for ``app.services.reranker.RerankerService`` with all HTTP
calls patched via ``unittest.mock``.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.reranker import RerankerService


@pytest.fixture
def reranker() -> RerankerService:
    """Fresh RerankerService instance (no singleton caching)."""
    return RerankerService()


class TestReranker:
    """RerankerService unit tests."""

    # ── Helper ──────────────────────────────────────────────────────────

    @staticmethod
    def _mock_response(data: dict) -> httpx.Response:
        """Build a minimal httpx.Response with JSON body."""
        return httpx.Response(
            status_code=200,
            json=data,
            request=httpx.Request("POST", "https://api.siliconflow.cn/v1/v1/rerank"),
        )

    # ── Tests ───────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_rerank_returns_results(self, reranker: RerankerService) -> None:
        """Happy path: two documents reranked, response structure verified."""
        mock_results = [
            {"index": 1, "relevance_score": 0.95},
            {"index": 0, "relevance_score": 0.72},
        ]
        mock_json = {"id": "rerank-xxx", "results": mock_results}

        mock_post = AsyncMock(return_value=self._mock_response(mock_json))

        with patch.object(reranker._client, "post", mock_post):
            results = await reranker.rerank(
                query="什么是机器学习",
                documents=[
                    "机器学习是人工智能的核心分支。",
                    "数据结构是计算机存储和组织数据的方式。",
                ],
                top_n=2,
            )

        assert results == mock_results
        assert len(results) == 2
        assert results[0]["index"] == 1
        assert results[0]["relevance_score"] == 0.95
        assert results[1]["index"] == 0
        assert results[1]["relevance_score"] == 0.72

        # Verify the payload sent to the API
        call_kwargs = mock_post.call_args.kwargs
        payload = call_kwargs["json"]
        assert payload["model"] == reranker._model
        assert payload["query"] == "什么是机器学习"
        assert len(payload["documents"]) == 2
        assert payload["top_n"] == 2

    @pytest.mark.asyncio
    async def test_rerank_empty_documents(self, reranker: RerankerService) -> None:
        """Empty documents list returns [] without making an HTTP call."""
        mock_post = AsyncMock()

        with patch.object(reranker._client, "post", mock_post):
            results = await reranker.rerank(
                query="hello",
                documents=[],
            )

        assert results == []
        mock_post.assert_not_called()

    @pytest.mark.asyncio
    async def test_rerank_top_n_capped(self, reranker: RerankerService) -> None:
        """top_n larger than len(documents) is auto-capped."""
        mock_results = [
            {"index": 0, "relevance_score": 0.88},
            {"index": 1, "relevance_score": 0.65},
        ]
        mock_json = {"id": "rerank-xxx", "results": mock_results}

        mock_post = AsyncMock(return_value=self._mock_response(mock_json))

        with patch.object(reranker._client, "post", mock_post):
            results = await reranker.rerank(
                query="test",
                documents=["doc a", "doc b"],
                top_n=100,  # exceeds document count
            )

        assert len(results) == 2  # capped at 2
        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["json"]["top_n"] == 2  # min(100, 2) = 2

    @pytest.mark.asyncio
    async def test_rerank_api_error(self, reranker: RerankerService) -> None:
        """HTTP error is wrapped in RuntimeError."""
        mock_post = AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "500 error",
            request=httpx.Request("POST", "https://api.siliconflow.cn/v1/rerank"),
                response=httpx.Response(status_code=500, request=httpx.Request("POST", "https://api.siliconflow.cn/v1/v1/rerank")),
            ),
        )

        with patch.object(reranker._client, "post", mock_post):
            with pytest.raises(RuntimeError, match="Reranker API 调用失败"):
                await reranker.rerank(
                    query="test",
                    documents=["doc"],
                )
