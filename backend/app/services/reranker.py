"""
Reranker Service — SiliconFlow BGE-reranker-v2-m3 cross-encoder.

Module-level singleton::

    from app.services.reranker import reranker
    results = await reranker.rerank(query, documents)
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class RerankerService:
    """SiliconFlow BGE-reranker-v2-m3 API client."""

    def __init__(self) -> None:
        self._api_key: str = settings.SILICONFLOW_API_KEY
        self._base_url: str = settings.SILICONFLOW_BASE_URL.rstrip("/")
        self._model: str = settings.RERANKER_MODEL
        self._timeout: float = settings.RERANKER_TIMEOUT
        self._client: httpx.AsyncClient = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=self._timeout,
        )

    async def rerank(
        self,
        query: str,
        documents: list[str],
        top_n: int | None = None,
    ) -> list[dict[str, Any]]:
        """Rerank documents against query via SiliconFlow cross-encoder.

        Args:
            query: User query string.
            documents: List of document text strings to rerank.
            top_n: Number of top results to return. Defaults to
                ``settings.RERANK_TOP_K`` (5).  Automatically capped at
                ``len(documents)``.

        Returns:
            List of dicts with keys ``index`` and ``relevance_score``,
            sorted by descending relevance score.  Empty list when
            ``documents`` is empty.
        """
        if not documents:
            return []

        n = settings.RERANK_TOP_K if top_n is None else top_n
        n = min(n, len(documents))

        payload = {
            "model": self._model,
            "query": query,
            "documents": documents,
            "top_n": n,
        }

        try:
            resp = await self._client.post("/rerank", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Reranker request failed: %s", e)
            raise RuntimeError(f"Reranker API 调用失败: {e}") from e

        data = resp.json()
        results: list[dict[str, Any]] = data.get("results", [])
        return results

    async def close(self) -> None:
        """Explicitly close the underlying HTTP client."""
        if hasattr(self, "_client") and not self._client.is_closed:
            await self._client.aclose()


# ── Module-level singleton ────────────────────────────────
reranker = RerankerService()
