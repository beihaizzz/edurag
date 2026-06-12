"""Node 2: Vector similarity search via ChromaDB"""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.graph.state import RAGState
from app.models import Document
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)


async def _fetch_document_titles(doc_ids: set[int]) -> dict[int, str]:
    """Batch-fetch document titles for a set of document IDs."""
    if not doc_ids:
        return {}

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Document.id, Document.title).where(Document.id.in_(doc_ids))
            )
            return {row.id: (row.title or f"Document{row.id}") for row in result}
    except Exception:
        logger.exception("Failed to fetch document titles")
        return {did: f"Document{did}" for did in doc_ids}


async def rag_search(state: RAGState) -> dict:
    """Search ChromaDB for relevant chunks.
    
    Uses existing VectorStoreService singleton.
    Filters by course_id if provided.
    Applies similarity threshold from settings.
    """
    question = state.get("question", "")
    course_id = state.get("course_id")

    try:
        results = await vector_store.search(
            query=question,
            top_k=settings.RAG_TOP_K,
            where_filter={"course_id": course_id} if course_id else None,
        )
    except Exception:
        logger.exception("Vector search failed")
        return {"internal_results": [], "has_internal_results": False}

    # Apply similarity threshold filter
    filtered = [
        r for r in results
        if r.get("score", 0) >= settings.RAG_SIMILARITY_THRESHOLD
    ]

    has_results = len(filtered) > 0
    logger.info("RAG search: %d raw → %d filtered (threshold=%.2f)", len(results), len(filtered), settings.RAG_SIMILARITY_THRESHOLD)

    # Fetch document titles for source citation
    doc_ids = {r.get("document_id") for r in filtered if r.get("document_id")}
    document_titles = await _fetch_document_titles(doc_ids)

    return {
        "internal_results": filtered,
        "has_internal_results": has_results,
        "document_titles": document_titles,
    }
