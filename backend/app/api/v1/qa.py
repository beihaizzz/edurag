"""QA API — 多轮对话 + 会话管理（SSE 流式）"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
# POST /qa — 提问（SSE 流式，支持多轮）
# ═══════════════════════════════════════════════════════════════════════

@router.post("/qa")
async def ask_question(
    body: QaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """发起新问题或续接已有会话，SSE 流式返回。

    SSE 事件:
    - thinking: AI 开始思考
    - chunk: 答案文本片段
    - sources: 参考来源列表
    - done: 完成（含 thread_id, session_id）
    - error: 错误
    """
    question = body.question
    course_id = body.course_id
    use_web_search = body.use_web_search

    if body.thread_id:
        stmt = select(UserSession).where(
            UserSession.thread_id == body.thread_id,
            UserSession.user_id == user.id,
        )
        result = await db.execute(stmt)
        session_record = result.scalar_one_or_none()
        if not session_record:
            async def err():
                yield f"data: {json.dumps({'type': 'error', 'message': '会话不存在'})}\n\n"
            return StreamingResponse(err(), media_type="text/event-stream")

        session_record.turn_count += 1
        thread_id = body.thread_id
    else:
        thread_id = str(uuid.uuid4())
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
        "thread_id": thread_id,
    })

    session_record.updated_at = datetime.utcnow()
    await db.commit()

    async def event_stream():
        try:
            yield f"data: {json.dumps({'type': 'thinking'})}\n\n"

            graph = await build_rag_graph()
            config = {"configurable": {"thread_id": thread_id}}
            input_state: RAGState = {
                "question": question,
                "course_id": course_id,
                "use_web_search": use_web_search,
            }

            state = await graph.ainvoke(input_state, config)

            answer = state.get("answer", "")
            sources = state.get("sources", [])
            is_rejected = state.get("is_rejected", False)

            for i in range(0, len(answer), 10):
                chunk = answer[i:i + 10]
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            yield f"data: {json.dumps({'type': 'sources', 'sources': sources, 'is_rejected': is_rejected})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'thread_id': thread_id, 'session_id': session_record.id, 'turn_count': session_record.turn_count})}\n\n"

        except Exception:
            logger.exception("QA streaming failed")
            yield f"data: {json.dumps({'type': 'error', 'message': '问答处理失败，请稍后重试'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /qa — 会话列表
# ═══════════════════════════════════════════════════════════════════════

@router.get("/qa")
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """当前用户的会话列表"""
    offset = (page - 1) * page_size
    count_q = select(func.count()).select_from(UserSession).where(
        UserSession.user_id == user.id
    )
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(desc(UserSession.updated_at))
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(q)
    sessions = result.scalars().all()

    items = [{
        "id": s.id, "thread_id": s.thread_id, "title": s.first_question,
        "turn_count": s.turn_count, "course_id": s.course_id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    } for s in sessions]

    return APIResponse(data=PaginatedData(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    ).model_dump())


# ═══════════════════════════════════════════════════════════════════════
# GET /qa/{session_id} — 会话详情
# ═══════════════════════════════════════════════════════════════════════

@router.get("/qa/{session_id}")
async def get_session_detail(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    chat_history = []
    try:
        graph = await build_rag_graph()
        graph_state = await graph.aget_state({"configurable": {"thread_id": session.thread_id}})
        if graph_state and graph_state.values:
            history = graph_state.values.get("chat_history", [])
            chat_history = [{
                "role": m.get("role", "user"),
                "content": m.get("content", ""),
                "sources": m.get("sources", []) if m.get("role") == "assistant" else None,
            } for m in history]
    except Exception:
        logger.exception("Failed to load graph state for session %d", session_id)

    return APIResponse(data={
        "id": session.id, "thread_id": session.thread_id,
        "title": session.first_question, "turn_count": session.turn_count,
        "course_id": session.course_id, "chat_history": chat_history,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    })


# ═══════════════════════════════════════════════════════════════════════
# DELETE /qa/{session_id} — 删除会话
# ═══════════════════════════════════════════════════════════════════════

@router.delete("/qa/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    await db.delete(session)
    await db.commit()
    return APIResponse(message="会话已删除")
