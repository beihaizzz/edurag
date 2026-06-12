"""Node 3: Build context with citation numbering (Perplexity-style)"""

from __future__ import annotations

import logging

from app.graph.state import RAGState

logger = logging.getLogger(__name__)


async def build_context(state: RAGState) -> dict:
    """Build citation-numbered context from internal search results.

    Format: [来源N: Document Title]\\nContent snippet
    """
    internal_results = state.get("internal_results", [])

    if not internal_results:
        return {"context": "", "sources": [], "search_mode": "internal"}

    # Collect unique document IDs
    doc_ids = {r.get("document_id") for r in internal_results if r.get("document_id")}
    titles = state.get("document_titles", {})

    context_parts: list[str] = []
    sources: list[dict] = []

    for idx, result in enumerate(internal_results, start=1):
        doc_id = result.get("document_id", 0)
        title = titles.get(doc_id, f"Document{doc_id}")
        content = result.get("content", "")
        score = result.get("score", 0)

        context_parts.append(f"[来源{idx}: {title}]\n{content}")
        sources.append({
            "index": idx,
            "chunk_id": result.get("chunk_id"),
            "document_id": doc_id,
            "title": title,
            "score": score,
        })

    context = "\n\n".join(context_parts)
    logger.info("Built context: %d sources from %d docs", len(sources), len(doc_ids))

    return {
        "context": context,
        "sources": sources,
        "search_mode": "internal",
    }
