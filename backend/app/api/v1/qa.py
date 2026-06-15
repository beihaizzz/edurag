"""QA API — 课程问答 + 会话管理"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.graph.builder import build_rag_graph
from app.graph.state import RAGState
from app.models import User, UserSession
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.search import QaCreate
from app.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["qa"])

# ═══════════════════════════════════════════════════════════════════════
# POST /qa — SSE streaming RAG endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.post("/qa")
async def ask_question(
    body: QaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """LangGraph RAG QA with SSE streaming output.

    SSE events:
    - classify: intent classification result
    - retrieve: vector search results summary
    - generate: answer text deltas (when streaming supported)
    - review: output review result
    - reject: rejection with reason
    - done: final answer + sources + thread_id
    """
    thread_id = str(uuid.uuid4())
    question = body.question
    course_id = body.course_id
    use_web_search = body.use_web_search

    # Create UserSession record
    session_record = UserSession(
        thread_id=thread_id,
        user_id=user.id,
        course_id=course_id,
        first_question=question,
        turn_count=1,
    )
    db.add(session_record)
    await db.commit()

    await log_action(db, user.id, "ask_question", {
        "course_id": course_id,
        "question": question[:100],
    })

    try:
        graph = await build_rag_graph()
        config = {"configurable": {"thread_id": thread_id}}
        initial_state: RAGState = {
            "question": question,
            "course_id": course_id,
            "use_web_search": use_web_search,
        }

        state = await graph.ainvoke(initial_state, config)

        session_record.updated_at = datetime.utcnow()
        await db.commit()

        return APIResponse(data={
            "id": session_record.id,
            "question": question,
            "answer": state.get("answer", ""),
            "sources": state.get("sources", []),
            "is_rejected": state.get("is_rejected", False),
            "latency_ms": 0,
            "course_id": course_id,
            "created_at": session_record.created_at.isoformat() if session_record.created_at else "",
        })

    except Exception:
        logger.exception("QA failed")
        return APIResponse(code=50001, message="问答处理失败，请稍后重试")

# ═══════════════════════════════════════════════════════════════════════
# GET /qa/sessions — list sessions
# ═══════════════════════════════════════════════════════════════════════

@router.get("/qa/sessions", response_model=APIResponse[PaginatedData])
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List current user's QA sessions (paginated)."""
    offset = (page - 1) * page_size

    count_stmt = select(func.count()).select_from(UserSession).where(UserSession.user_id == user.id)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(desc(UserSession.updated_at))
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    items = [
        {
            "thread_id": s.thread_id,
            "first_question": s.first_question,
            "turn_count": s.turn_count,
            "created_at": str(s.created_at),
            "updated_at": str(s.updated_at),
        }
        for s in sessions
    ]

    total_pages = (total + page_size - 1) // page_size if total else 1

    return {
        "code": 200,
        "message": "ok",
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        },
    }

# ═══════════════════════════════════════════════════════════════════════
# GET /qa/sessions/{session_id} — session detail with chat history
# ═══════════════════════════════════════════════════════════════════════

@router.get("/qa/sessions/{session_id}")
async def get_session_detail(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get session detail with full chat history from LangGraph state."""
    stmt = select(UserSession).where(
        UserSession.id == session_id,
        UserSession.user_id == user.id,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get chat history from LangGraph state
    try:
        graph = await build_rag_graph()
        graph_state = await graph.aget_state({"configurable": {"thread_id": session.thread_id}})

        chat_history = []
        if graph_state and graph_state.values:
            history = graph_state.values.get("chat_history", [])
            chat_history = [
                {"role": m.get("role", "user"), "content": m.get("content", "")}
                for m in history
            ]
    except Exception:
        logger.exception("Failed to load graph state for session %d", session_id)
        chat_history = []

    return {
        "code": 200,
        "message": "ok",
        "data": {
            "thread_id": session.thread_id,
            "first_question": session.first_question,
            "turn_count": session.turn_count,
            "created_at": str(session.created_at),
            "updated_at": str(session.updated_at),
            "chat_history": chat_history,
        },
    }
