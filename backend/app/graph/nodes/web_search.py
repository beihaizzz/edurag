"""Node 4: Tavily web search fallback with graceful degradation"""

from __future__ import annotations

import logging

from app.graph.state import RAGState
from app.graph.web_search_client import search_tavily

logger = logging.getLogger(__name__)


async def web_search(state: RAGState) -> dict:
    """Search the web via Tavily API as fallback when internal search returns nothing.
    
    Builds context with [网络N] prefix to distinguish from internal sources.
    Gracefully returns empty on timeout or missing API key.
    """
    question = state.get("question", "")
    # Use the rewritten query if rewrite_query produced one. Web search on
    # short follow-ups like "继续讲讲" pulls random unrelated pages; the
    # rewritten form ("链表的详细原理") gives Tavily a fighting chance.
    search_query = state.get("rewritten_question") or question

    results = await search_tavily(
        query=search_query,
        max_results=5,
        timeout=10.0,
    )

    if not results:
        return {
            "context": "",
            "sources": [],
            "has_web_results": False,
            "search_mode": "web",
            "rejection_category": "web_failed",
        }

    context_parts: list[str] = []
    sources: list[dict] = []

    for idx, result in enumerate(results, start=1):
        title = result.get("title", "Untitled")
        content = result.get("content", "")
        url = result.get("url", "")
        score = result.get("score", 0)

        context_parts.append(f"[网络{idx}: {title}]\n{content}")
        sources.append({
            "index": idx,
            "title": title,
            "url": url,
            "score": score,
            "note": "Tavily score is relevance, not credibility",
        })

    context = "\n\n".join(context_parts)
    logger.info("Web search: %d results for '%s'", len(sources), search_query[:50])

    return {
        "context": context,
        "sources": sources,
        "has_web_results": True,
        "search_mode": "web",
    }
