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
    # The reranker scores each chunk against a query. Using the raw current-turn
    # question ("继续讲讲") on a follow-up produces near-zero relevance scores
    # for every chunk because the question has no concrete semantic content.
    # Use the rewritten query (e.g. "链表的详细原理") so the cross-encoder can
    # actually judge relevance.
    rerank_query = state.get("rewritten_question") or question

    if not internal_results or not rerank_query:
        return {
            "internal_results": internal_results,
            "has_internal_results": bool(internal_results),
            "reranked": False,
            "input_count": len(internal_results),
            "output_count": len(internal_results),
        }

    try:
        documents = [r.get("content", "") for r in internal_results]
        top_n = settings.RERANK_TOP_K

        results = await reranker_service.rerank(rerank_query, documents, top_n=top_n)

        # Map results[].index → internal_results[idx], set relevance score, and
        # keep only chunks whose cross-encoder relevance clears the threshold.
        # The cross-encoder score is far more reliable than cosine, so it — not
        # the loose cosine prefilter — is what decides "do we have real material?".
        threshold = settings.RERANK_SCORE_THRESHOLD
        reranked = []
        for rr in results:
            idx = rr["index"]
            if 0 <= idx < len(internal_results):
                score = rr.get("relevance_score", 0)
                if score < threshold:
                    continue
                item = dict(internal_results[idx])
                item["score"] = score
                reranked.append(item)

        has_results = len(reranked) > 0
        logger.info(
            "Reranker: %d → %d results (relevance>=%.2f, has_results=%s)",
            len(internal_results), len(reranked), threshold, has_results,
        )

        return {
            "internal_results": reranked,
            "has_internal_results": has_results,
            "reranked": True,
            "input_count": len(internal_results),
            "output_count": len(reranked),
        }

    except Exception:
        # Fail-open: reranker (API) is down. Fall back to cosine ordering, but
        # apply a STRICTER cosine threshold than the loose prefilter so that
        # borderline noise does not get treated as real internal material.
        logger.warning("Reranker failed, fallback to cosine ordering", exc_info=True)
        fallback_threshold = settings.RAG_FALLBACK_THRESHOLD
        fallback = [
            r for r in internal_results
            if r.get("score", 0) >= fallback_threshold
        ]
        has_results = len(fallback) > 0
        logger.info(
            "Reranker fallback: %d → %d results (cosine>=%.2f, has_results=%s)",
            len(internal_results), len(fallback), fallback_threshold, has_results,
        )
        return {
            "internal_results": fallback,
            "has_internal_results": has_results,
            "reranked": False,
            "input_count": len(internal_results),
            "output_count": len(fallback),
        }
