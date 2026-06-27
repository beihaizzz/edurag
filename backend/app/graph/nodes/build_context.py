"""Node 3: Build context with citation numbering (Perplexity-style).

Citation granularity is **per document**, not per chunk: when the retriever
returns several chunks of the same document, they are merged into a single
[来源N] block so the user sees one citation per source document. The merged
block keeps every chunk's text (joined with "...") so the LLM still has the
full retrieved evidence.

Returned ``sources[i]`` keeps:

* ``index``        — 1-based citation number used in the answer
* ``document_id``  — the document this citation refers to
* ``title``        — document title shown to the user
* ``score``        — best (max) relevance score among the merged chunks
* ``chunk_id``     — the highest-scoring chunk (kept for backward compat;
                     frontend ``SourceItem.chunk_id`` is optional)
* ``chunk_ids``    — all merged chunk ids in display order
"""

from __future__ import annotations

import logging
from typing import Any

from app.graph.state import RAGState

logger = logging.getLogger(__name__)


async def build_context(state: RAGState) -> dict:
    """Build citation-numbered context, one citation per source document.

    Format::

        [来源N: Document Title]
        chunk1_text
        …
        chunk2_text
    """
    internal_results = state.get("internal_results", [])

    if not internal_results:
        return {"context": "", "sources": [], "search_mode": "internal"}

    titles = state.get("document_titles", {})

    # ── Group chunks by document_id, preserving rerank order ───────────
    # First-seen document_id determines its citation index, so the top-ranked
    # document becomes [来源1]. This keeps citation order aligned with the
    # reranker's relevance ranking.
    groups: dict[Any, dict] = {}
    order: list[Any] = []
    for result in internal_results:
        doc_id = result.get("document_id", 0)
        if doc_id not in groups:
            groups[doc_id] = {
                "document_id": doc_id,
                "title": titles.get(doc_id, f"Document{doc_id}"),
                "chunks": [],          # list of (chunk_id, content, score)
                "best_score": 0.0,
                "best_chunk_id": None,
            }
            order.append(doc_id)
        g = groups[doc_id]
        chunk_id = result.get("chunk_id")
        content = result.get("content", "")
        score = float(result.get("score", 0) or 0)
        g["chunks"].append((chunk_id, content, score))
        if score > g["best_score"]:
            g["best_score"] = score
            g["best_chunk_id"] = chunk_id

    # ── Build LLM-visible context + structured sources list ────────────
    context_parts: list[str] = []
    sources: list[dict] = []
    for idx, doc_id in enumerate(order, start=1):
        g = groups[doc_id]
        # Join the merged chunks with a visible separator so the LLM can see
        # that this [来源N] block contains multiple excerpts of the same doc.
        merged_text = "\n…\n".join(c for _, c, _ in g["chunks"])
        context_parts.append(f"[来源{idx}: {g['title']}]\n{merged_text}")

        sources.append({
            "index": idx,
            "document_id": doc_id,
            "title": g["title"],
            "score": g["best_score"],
            # Backward-compat: frontend SourceItem.chunk_id is optional; use
            # the best chunk for "jump to passage" deep-link if implemented.
            "chunk_id": g["best_chunk_id"],
            # Full list of merged chunks for future per-passage navigation.
            "chunk_ids": [cid for cid, _, _ in g["chunks"] if cid is not None],
        })

    context = "\n\n".join(context_parts)
    logger.info(
        "Built context: %d sources (%d chunks merged) from %d docs",
        len(sources),
        len(internal_results),
        len(order),
    )

    return {
        "context": context,
        "sources": sources,
        "search_mode": "internal",
    }
