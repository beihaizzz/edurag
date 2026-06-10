"""QA 问答 API 路由 — RAG 检索增强生成 + 问答历史"""

from __future__ import annotations

import logging
import math
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_deepseek import ChatDeepSeek
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models import Document, QAHistory, User
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.search import QaCreate, QaItem, QaResponse, QaSource
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["qa"])

# ═══════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = (
    "你是校园课程资料问答助手。请仅根据参考资料回答。"
    "无法回答时如实告知。引用来源编号。使用中文。"
)

REJECTION_ANSWER = "抱歉，未找到与您问题相关的课程资料。"

# Simple prompt injection patterns (compiled once)
_INJECTION_RE = re.compile(
    r"(?:"
    r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?"
    r"|忘记\s*(?:之前的|所有)?\s*(?:指示|指令|提示)"
    r"|请忽略"
    r"|system\s*prompt"
    r"|你是一个"
    r"|DAN\s*模式"
    r"|###\s*[Ii]nstruction"
    r"|new\s+instructions?\s*:"
    r"|you\s+are\s+now"
    r"|现在你是一个"
    r"|forget\s+(?:all\s+)?(?:previous|prior)\s+instructions?"
    r")",
    re.IGNORECASE,
)

_CITATION_RE = re.compile(r"\[来源(\d+)\]")


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════


def _detect_injection(question: str) -> bool:
    """Simple prompt injection detection — returns True if suspicious patterns found."""
    return bool(_INJECTION_RE.search(question))


def _parse_citations(answer: str) -> set[int]:
    """Extract source indices from [来源X] references in the LLM answer."""
    return {int(m) for m in _CITATION_RE.findall(answer)}


async def _get_document_titles(
    db: AsyncSession, doc_ids: set[int]
) -> dict[int, str]:
    """Batch-fetch document titles for a set of document IDs."""
    if not doc_ids:
        return {}
    result = await db.execute(
        select(Document.id, Document.title).where(Document.id.in_(doc_ids))
    )
    return {row.id: (row.title or f"文档{row.id}") for row in result}


async def _save_and_return_rejected(
    db: AsyncSession,
    user: User,
    body: QaCreate,
    latency_ms: int,
) -> APIResponse:
    """Save a rejected QA entry and return the standardized rejected response."""
    qa = QAHistory(
        user_id=user.id,
        course_id=body.course_id,
        question=body.question,
        answer=REJECTION_ANSWER,
        sources=None,
        is_rejected=True,
        latency_ms=latency_ms,
    )
    db.add(qa)
    await db.commit()
    await db.refresh(qa)

    return APIResponse(
        data=QaResponse(
            id=qa.id,
            question=qa.question,
            answer=qa.answer,
            sources=None,
            is_rejected=True,
            latency_ms=latency_ms,
        ).model_dump(),
    )


# ═══════════════════════════════════════════════════════════════════════
# POST /qa  —  RAG 问答
# ═══════════════════════════════════════════════════════════════════════


@router.post("/qa", response_model=APIResponse)
async def ask_question(
    body: QaCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """RAG 问答：向量检索 → 上下文增强 → DeepSeek 生成答案。

    流程：
    1. Prompt 注入检测（如启用）
    2. 向量检索（可选的 course 过滤）
    3. 相似度阈值过滤
    4. 无匹配 → 返回兜底回答
    5. 构建上下文 → 调用 DeepSeek LLM
    6. 解析引用 → 保存历史 → 返回结果
    """
    # ── 1. Prompt injection check ──
    if settings.PROMPT_INJECTION_DETECTION_ENABLED and _detect_injection(body.question):
        logger.warning("Prompt injection detected for user_id=%d", user.id)
        return await _save_and_return_rejected(db, user, body, 0)

    # ── 2. Vector search ──
    t0 = time.perf_counter()

    where_filter: dict[str, Any] | None = None
    if body.course_id is not None:
        where_filter = {"course_id": body.course_id}

    results = await vector_store.search(
        query=body.question,
        top_k=settings.RAG_TOP_K,
        where_filter=where_filter,
    )

    # ── 3. Filter by similarity threshold ──
    filtered = [r for r in results if r["score"] >= settings.RAG_SIMILARITY_THRESHOLD]

    # ── 4. No relevant chunks → reject ──
    if not filtered:
        t1 = time.perf_counter()
        latency_ms = int((t1 - t0) * 1000)
        return await _save_and_return_rejected(db, user, body, latency_ms)

    # ── 5. Build context with document titles ──
    doc_ids = {r["document_id"] for r in filtered}
    doc_title_map = await _get_document_titles(db, doc_ids)

    sources: list[QaSource] = []
    context_parts: list[str] = []

    for i, r in enumerate(filtered, start=1):
        doc_id = r["document_id"]
        title = doc_title_map.get(doc_id, f"文档{doc_id}")
        context_parts.append(f"[来源{i}: {title}]\n{r['content']}\n")
        sources.append(
            QaSource(
                chunk_id=r["chunk_id"],
                document_id=doc_id,
                title=title,
                score=r["score"],
            )
        )

    context = "\n".join(context_parts)

    # ── 6. Call DeepSeek LLM ──
    llm = ChatDeepSeek(
        model=settings.DEEPSEEK_MODEL,
        api_key=settings.DEEPSEEK_API_KEY,
        temperature=0.3,
    )

    human_prompt = f"参考资料：\n{context}\n\n问题：{body.question}"
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_prompt),
    ]

    llm_response = await llm.ainvoke(messages)
    answer = llm_response.content

    # ── 7. Parse citations ──
    cited_indices = _parse_citations(answer)
    matched_sources = [s for idx, s in enumerate(sources, start=1) if idx in cited_indices]

    t1 = time.perf_counter()
    latency_ms = int((t1 - t0) * 1000)

    # ── 8. Save QA history ──
    qa = QAHistory(
        user_id=user.id,
        course_id=body.course_id,
        question=body.question,
        answer=answer,
        sources=[s.model_dump() for s in matched_sources] if matched_sources else None,
        is_rejected=False,
        latency_ms=latency_ms,
    )
    db.add(qa)
    await db.commit()
    await db.refresh(qa)

    # ── 9. Return ──
    return APIResponse(
        data=QaResponse(
            id=qa.id,
            question=qa.question,
            answer=qa.answer,
            sources=matched_sources if matched_sources else None,
            is_rejected=False,
            latency_ms=latency_ms,
        ).model_dump(),
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /qa  —  问答历史列表
# ═══════════════════════════════════════════════════════════════════════


@router.get("/qa", response_model=APIResponse)
async def list_qa_history(
    course_id: int | None = Query(None, description="按课程筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """当前用户的问答历史列表，支持按课程筛选 + 分页。"""
    base = select(QAHistory).where(QAHistory.user_id == user.id)

    if course_id is not None:
        base = base.where(QAHistory.course_id == course_id)

    # 总数
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 分页查询
    q = (
        base
        .order_by(QAHistory.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    records = result.scalars().all()

    items = [
        QaItem(
            id=r.id,
            question=r.question,
            answer=r.answer,
            sources=[QaSource(**s) for s in r.sources] if r.sources else None,
            is_rejected=r.is_rejected,
            latency_ms=r.latency_ms,
            course_id=r.course_id,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ).model_dump()
        for r in records
    ]

    return APIResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if total else 0,
        ).model_dump(),
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /qa/{id}  —  单条问答详情
# ═══════════════════════════════════════════════════════════════════════


@router.get("/qa/{qa_id}", response_model=APIResponse)
async def get_qa_detail(
    qa_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """获取单条问答详情（仅限当前用户自己的记录）。"""
    result = await db.execute(
        select(QAHistory).where(
            QAHistory.id == qa_id,
            QAHistory.user_id == user.id,
        )
    )
    qa = result.scalar_one_or_none()

    if qa is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="问答记录不存在",
        )

    return APIResponse(
        data=QaItem(
            id=qa.id,
            question=qa.question,
            answer=qa.answer,
            sources=[QaSource(**s) for s in qa.sources] if qa.sources else None,
            is_rejected=qa.is_rejected,
            latency_ms=qa.latency_ms,
            course_id=qa.course_id,
            created_at=qa.created_at.isoformat() if qa.created_at else None,
        ).model_dump(),
    )
