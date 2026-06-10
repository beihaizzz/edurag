"""统一检索 API — keyword / semantic / hybrid"""

import logging
import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models import Chunk, Course, Document, User
from app.schemas.common import APIResponse
from app.schemas.search import MatchedSnippet, SearchResponse, SearchResultItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["search"])

# ─────────────────────────────────────────────────────────────────────
# Per-mode search helpers
# ─────────────────────────────────────────────────────────────────────

MAX_SNIPPETS_PER_DOC = 5
MAX_KEYWORD_CHUNKS = 200


async def _keyword_search(
    q: str,
    db: AsyncSession,
    course_id: int | None = None,
) -> dict[int, list[tuple[int, str, float]]]:
    """SQL ``ILIKE`` on chunks.content. Group by document, keep top snippets per doc.

    Returns ``{document_id: [(chunk_id, content, score), ...]}``.
    """
    stmt = (
        select(Chunk, Document, Course)
        .join(Document, Chunk.document_id == Document.id)
        .outerjoin(Course, Document.course_id == Course.id)
        .where(Chunk.content.ilike(f"%{q}%"))
        .where(Document.status == "approved")
        .order_by(Chunk.id)
        .limit(MAX_KEYWORD_CHUNKS)
    )
    if course_id is not None:
        stmt = stmt.where(Document.course_id == course_id)

    result = await db.execute(stmt)
    rows = result.all()

    doc_snippets: dict[int, list[tuple[int, str, float]]] = {}
    for chunk, _doc, _course in rows:
        doc_snippets.setdefault(chunk.document_id, [])
        if len(doc_snippets[chunk.document_id]) < MAX_SNIPPETS_PER_DOC:
            doc_snippets[chunk.document_id].append((chunk.id, chunk.content, 1.0))

    return doc_snippets


async def _semantic_search(
    q: str,
    db: AsyncSession,
    course_id: int | None = None,
) -> dict[int, list[tuple[int, str, float]]]:
    """Vector similarity search via ChromaDB.

    Returns ``{document_id: [(chunk_id, content, score), ...]}``.
    Returns empty dict on import error, search failure, or no results.
    """
    try:
        from app.services.vector_store import vector_store
    except ImportError:
        logger.warning("vector_store module unavailable — semantic search disabled")
        return {}

    # When filtering by course, resolve document_ids first for the ChromaDB where clause.
    doc_ids: list[int] | None = None
    if course_id is not None:
        id_result = await db.execute(
            select(Document.id).where(
                Document.course_id == course_id,
                Document.status == "approved",
            )
        )
        doc_ids = [row[0] for row in id_result.all()]
        if not doc_ids:
            return {}

    where_filter = {"document_id": {"$in": doc_ids}} if doc_ids else None

    try:
        results = await vector_store.search(
            query=q,
            top_k=settings.RAG_TOP_K,
            where_filter=where_filter,
        )
    except Exception as exc:
        logger.warning("Vector search failed: %s", exc)
        return {}

    # Apply similarity threshold & group by document_id.
    doc_snippets: dict[int, list[tuple[int, str, float]]] = {}
    for r in results:
        if r["score"] < settings.RAG_SIMILARITY_THRESHOLD:
            continue
        doc_snippets.setdefault(r["document_id"], [])
        doc_snippets[r["document_id"]].append((r["chunk_id"], r["content"], r["score"]))

    return doc_snippets


# ─────────────────────────────────────────────────────────────────────
# Hybrid merge & pagination
# ─────────────────────────────────────────────────────────────────────


def _merge_results(
    kw_results: dict[int, list[tuple[int, str, float]]],
    sem_results: dict[int, list[tuple[int, str, float]]],
) -> dict[int, list[tuple[int, str, float]]]:
    """Merge keyword + semantic results by document_id.

    - Deduplicate snippets by chunk_id (keep higher score).
    - Keep top-N snippets per document.
    - Sort snippets within each document by score descending.
    """
    merged: dict[int, list[tuple[int, str, float]]] = {}

    # Start with keyword results.
    for doc_id, snippets in kw_results.items():
        merged[doc_id] = list(snippets)

    # Blend in semantic results.
    for doc_id, snippets in sem_results.items():
        if doc_id not in merged:
            merged[doc_id] = list(snippets)
        else:
            existing_by_chunk = {c[0]: i for i, c in enumerate(merged[doc_id])}
            for chunk_id, content, score in snippets:
                if chunk_id in existing_by_chunk:
                    idx = existing_by_chunk[chunk_id]
                    if score > merged[doc_id][idx][2]:
                        merged[doc_id][idx] = (chunk_id, content, score)
                else:
                    merged[doc_id].append((chunk_id, content, score))

    # Prune & sort per document.
    for doc_id in merged:
        merged[doc_id].sort(key=lambda x: x[2], reverse=True)
        merged[doc_id] = merged[doc_id][:MAX_SNIPPETS_PER_DOC]

    return merged


# ─────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────


@router.get("/search", response_model=APIResponse)
async def unified_search(
    q: str = Query(..., description="搜索关键词 / 查询语句"),
    mode: str = Query("keyword", description="检索模式: keyword | semantic | hybrid"),
    course_id: int | None = Query(None, description="按课程筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """统一检索端点 — 支持关键词、语义、混合三种检索模式。

    所有登录用户可访问。
    """
    # ── 1. Execute search(es) ──────────────────────────────────────
    kw_results: dict[int, list[tuple[int, str, float]]] = {}
    sem_results: dict[int, list[tuple[int, str, float]]] = {}

    if mode in ("keyword", "hybrid"):
        kw_results = await _keyword_search(q, db, course_id)

    if mode in ("semantic", "hybrid"):
        sem_results = await _semantic_search(q, db, course_id)

    # Graceful fallback for semantic-only mode when vector store is unavailable.
    effective_mode = mode
    if mode == "semantic" and not sem_results:
        kw_results = await _keyword_search(q, db, course_id)
        effective_mode = "keyword"

    # ── 2. Merge & deduplicate ─────────────────────────────────────
    if mode == "hybrid":
        doc_snippets = _merge_results(kw_results, sem_results)
    elif mode == "semantic" and sem_results:
        doc_snippets = sem_results
    else:
        doc_snippets = kw_results

    # ── 3. Sort documents by best snippet score (desc) ────────────
    sorted_docs = sorted(
        doc_snippets.items(),
        key=lambda item: max(s[2] for s in item[1]) if item[1] else 0,
        reverse=True,
    )

    total = len(sorted_docs)
    total_pages = max(1, math.ceil(total / page_size))

    # ── 4. Paginate ────────────────────────────────────────────────
    start = (page - 1) * page_size
    end = start + page_size
    paged_docs = sorted_docs[start:end]

    # ── 5. Batch-fetch document metadata ───────────────────────────
    doc_ids = [doc_id for doc_id, _ in paged_docs]
    doc_info: dict[int, tuple[str, str, str]] = {}  # id → (title, file_type, course_name)

    if doc_ids:
        doc_result = await db.execute(
            select(Document)
            .options(joinedload(Document.course))
            .where(Document.id.in_(doc_ids))
        )
        for doc in doc_result.unique().scalars().all():
            course_name = doc.course.name if doc.course else ""
            doc_info[doc.id] = (doc.title or doc.filename, doc.file_type, course_name)

    # ── 6. Build response ──────────────────────────────────────────
    results: list[SearchResultItem] = []
    for doc_id, snippets in paged_docs:
        title, file_type, course_name = doc_info.get(doc_id, ("", "", ""))
        results.append(
            SearchResultItem(
                document_id=doc_id,
                title=title,
                file_type=file_type,
                course_name=course_name,
                matched_snippets=[
                    MatchedSnippet(chunk_id=cid, content=content, score=score)
                    for cid, content, score in snippets
                ],
            )
        )

    return APIResponse(
        data=SearchResponse(
            results=results,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            mode=effective_mode,
            query=q,
        ).model_dump(),
    )
