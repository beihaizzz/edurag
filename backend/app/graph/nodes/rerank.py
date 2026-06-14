"""Node: Cross-encoder reranking via SiliconFlow BGE-reranker-v2-m3.

Fail-open: on any error, returns original cosine-ordered results unchanged.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.graph.state import RAGState
from app.services.reranker import reranker as reranker_service

logger = logging.getLogger(__name__)


async def rerank(state: RAGState) -> dict:
    """Rerank internal_results using cross-encoder (SiliconFlow bge-reranker-v2-m3).

    Returns:
        dict with keys:
            internal_results — reranked (or original on fallback)
            reranked — bool indicating whether reranker was used
            input_count — number of input chunks
            output_count — number of output chunks (after rerank)
    """
    internal_results = state.get("internal_results", [])
    question = state.get("question", "")

    if not internal_results or not question:
        return {
            "internal_results": internal_results,
            "reranked": False,
            "input_count": len(internal_results),
            "output_count": len(internal_results),
        }

    try:
        documents = [r.get("content", "") for r in internal_results]
        top_n = settings.RERANK_TOP_K

        results = await reranker_service.rerank(question, documents, top_n=top_n)

        # Map results[].index → internal_results[idx], set score
        reranked = []
        for rr in results:
            idx = rr["index"]
            if 0 <= idx < len(internal_results):
                item = dict(internal_results[idx])
                item["score"] = rr.get("relevance_score", item.get("score", 0))
                reranked.append(item)

        logger.info("Reranker: %d → %d results", len(internal_results), len(reranked))

        return {
            "internal_results": reranked,
            "reranked": True,
            "input_count": len(internal_results),
            "output_count": len(reranked),
        }

    except Exception:
        logger.warning("Reranker failed, fallback to cosine ordering", exc_info=True)
        return {
            "internal_results": internal_results,
            "reranked": False,
            "input_count": len(internal_results),
            "output_count": len(internal_results),
        }
