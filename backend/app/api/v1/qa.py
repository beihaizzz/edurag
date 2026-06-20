"""QA API — LangGraph SSE streaming endpoint + session management"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.graph.builder import build_rag_graph
from app.graph.state import RAGState
from app.models import Feedback, QAHistory, User, UserSession
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.search import QaCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["qa"])

# Per-thread locks to serialize regenerate / continuation on the same thread,
# preventing concurrent checkpoint forks on a single conversation.
_thread_locks: dict[str, asyncio.Lock] = {}


def _get_thread_lock(thread_id: str) -> asyncio.Lock:
    lock = _thread_locks.get(thread_id)
    if lock is None:
        lock = asyncio.Lock()
        _thread_locks[thread_id] = lock
    return lock

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
    question = body.question
    course_id = body.course_id
    use_web_search = body.use_web_search
    regenerate = body.regenerate

    # Determine thread_id: reuse existing or create new
    raw_thread_id = body.thread_id
    is_new_session = not (raw_thread_id and raw_thread_id.strip())
    thread_id = raw_thread_id.strip() if raw_thread_id and raw_thread_id.strip() else str(uuid.uuid4())

    # Regenerate requires an existing thread to roll back to.
    if regenerate and is_new_session:
        raise HTTPException(status_code=400, detail="regenerate requires an existing thread_id")

    if is_new_session:
        session_record = UserSession(
            thread_id=thread_id,
            user_id=user.id,
            course_id=course_id,
            first_question=question,
            turn_count=1,
        )
        db.add(session_record)
        await db.commit()
    else:
        # Ownership check
        result = await db.execute(
            select(UserSession).where(
                UserSession.thread_id == thread_id,
                UserSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=403, detail="Thread not found or not owned")
        # Regenerate replaces the last turn — do NOT increment turn_count.
        if not regenerate:
            session.turn_count = (session.turn_count or 0) + 1
        session_record = session
        await db.commit()

    async def event_stream():
        try:
            # Build graph
            graph = await build_rag_graph()

            # Serialize regenerate/continuation on the same thread to avoid
            # concurrent checkpoint forks corrupting the conversation.
            async with _get_thread_lock(thread_id):
                # Default: fresh run with full initial state on the thread head.
                initial_input: RAGState | None = {
                    "question": question,
                    "course_id": course_id,
                    "use_web_search": use_web_search,
                }
                config = {"configurable": {"thread_id": thread_id}}

                if regenerate:
                    # Time-travel replay: rewind to the checkpoint at the START of
                    # the last turn (next == classify_intent), where chat_history
                    # does NOT yet contain that turn's pair. Re-running from there
                    # re-answers the same question while preserving earlier turns,
                    # and the operator.add reducer appends the new pair exactly once.
                    replay_target = None
                    async for snap in graph.aget_state_history(config):
                        if snap.next == ("classify_intent",):
                            replay_target = snap
                            break
                    if replay_target is None:
                        yield f"event: error\ndata: {json.dumps({'error': 'regenerate_failed', 'detail': 'no prior turn checkpoint found'})}\n\n"
                        return
                    # Replay from that checkpoint. Pass the CURRENT request params
                    # as input so they override the snapshot's stale values — e.g.
                    # the user may have toggled web search on before regenerating.
                    # question/course_id/use_web_search are non-reducer fields (overwrite),
                    # while chat_history (operator.add) is untouched, so earlier turns
                    # are preserved and the new pair is appended exactly once.
                    config = replay_target.config
                    initial_input = {
                        "question": question,
                        "course_id": course_id,
                        "use_web_search": use_web_search,
                    }

                last_node = ""
                start_time = time.perf_counter()

                async for event in graph.astream(
                    initial_input,
                    config,
                    stream_mode="updates",
                ):
                    for node_name, node_output in event.items():
                        last_node = node_name

                        if node_name == "classify_intent":
                            intent = node_output.get("intent", "NORMAL")
                            if intent != "NORMAL":
                                yield f"event: reject\ndata: {json.dumps({'intent': intent, 'reason': 'intent_blocked'})}\n\n"
                            else:
                                yield f"event: classify\ndata: {json.dumps({'intent': intent})}\n\n"

                        elif node_name == "rag_search":
                            has = node_output.get("has_internal_results", False)
                            count = len(node_output.get("internal_results", []))
                            yield f"event: retrieve\ndata: {json.dumps({'has_results': has, 'count': count})}\n\n"

                        elif node_name == "web_search":
                            has_web = node_output.get("has_web_results", False)
                            yield f"event: retrieve\ndata: {json.dumps({'source': 'web', 'has_results': has_web})}\n\n"

                        elif node_name == "generate_answer":
                            yield f"event: generate\ndata: {json.dumps({})}\n\n"

                        elif node_name == "review_output":
                            result = node_output.get("review_result", "PASS")
                            yield f"event: review\ndata: {json.dumps({'result': result})}\n\n"

                        elif node_name == "reject":
                            reason = node_output.get("rejection_reason", "")
                            yield f"event: reject\ndata: {json.dumps({'reason': reason, 'is_rejected': True})}\n\n"

                        elif node_name == "rerank":
                            in_count = node_output.get("input_count", 0)
                            out_count = node_output.get("output_count", 0)
                            yield f"event: rerank\ndata: {json.dumps({'input_count': in_count, 'output_count': out_count})}\n\n"

                        elif node_name == "return_answer":
                            pass  # handled in done event

                # After stream completes, retrieve persisted state from checkpointer.
                # Always use the thread-level config (no checkpoint_id) so we read
                # the LATEST state. During regenerate, `config` points at the replay
                # checkpoint_id, whose snapshot predates the freshly generated answer.
                state_snapshot = await graph.aget_state({"configurable": {"thread_id": thread_id}})
                state_values = state_snapshot.values if state_snapshot else {}

                # ── Persist to qa_history ──
                end_time = time.perf_counter()
                latency_ms = int((end_time - start_time) * 1000)

                # Regenerate replaces the last turn: drop the stale QAHistory row
                # for this thread before inserting the freshly generated one.
                if regenerate:
                    stale = await db.execute(
                        select(QAHistory)
                        .where(QAHistory.thread_id == thread_id, QAHistory.user_id == user.id)
                        .order_by(desc(QAHistory.id))
                        .limit(1)
                    )
                    stale_record = stale.scalar_one_or_none()
                    if stale_record:
                        await db.delete(stale_record)
                        await db.commit()

                qa_record = QAHistory(
                    user_id=user.id,
                    course_id=course_id,
                    thread_id=thread_id,
                    question=question,
                    answer=state_values.get("answer", ""),
                    sources=state_values.get("sources", []),
                    is_rejected=state_values.get("is_rejected", False),
                    latency_ms=latency_ms,
                )
                db.add(qa_record)
                await db.commit()
                await db.refresh(qa_record)

                # Send done event
                is_rejected = state_values.get("is_rejected", False)
                done_data = {
                    "answer": state_values.get("answer", ""),
                    "sources": [] if is_rejected else state_values.get("sources", []),
                    "is_rejected": is_rejected,
                    "rejection_reason": state_values.get("rejection_reason", ""),
                    "id": qa_record.id,
                    "session_id": session_record.id,
                    "thread_id": thread_id,
                }
                yield f"event: done\ndata: {json.dumps(done_data, default=str)}\n\n"

                # Update session timestamp
                await db.refresh(session_record)
                session_record.updated_at = datetime.utcnow()
                await db.commit()

        except Exception as e:
            import traceback
            loop_info = f"loop={type(asyncio.get_running_loop()).__name__} policy={type(asyncio.get_event_loop_policy()).__name__}"
            detail = f"{type(e).__name__}: {e} | {loop_info}"
            logger.exception("SSE stream failed: %s", detail)
            yield f"event: error\ndata: {json.dumps({'error': 'internal_error', 'detail': detail, 'trace': traceback.format_exc()[-500:]})}\n\n"

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
            "id": s.id,
            "thread_id": s.thread_id,
            "title": s.first_question,
            "first_question": s.first_question,
            "turn_count": s.turn_count,
            "course_id": s.course_id,
            "created_at": str(s.created_at),
            "updated_at": str(s.updated_at),
        }
        for s in sessions
    ]

    total_pages = (total + page_size - 1) // page_size if total else 1

    return {
        "code": 0,
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
        "code": 0,
        "message": "ok",
        "data": {
            "id": session.id,
            "thread_id": session.thread_id,
            "title": session.first_question,
            "first_question": session.first_question,
            "turn_count": session.turn_count,
            "course_id": session.course_id,
            "created_at": str(session.created_at),
            "updated_at": str(session.updated_at),
            "chat_history": chat_history,
        },
    }

# ═══════════════════════════════════════════════════════════════════════
# DELETE /qa/sessions/{session_id} — delete a session and its history
# ═══════════════════════════════════════════════════════════════════════

@router.delete("/qa/sessions/{session_id}", response_model=APIResponse[None])
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete current user's session, its QA history and feedback."""
    stmt = select(UserSession).where(
        UserSession.id == session_id,
        UserSession.user_id == user.id,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    thread_id = session.thread_id

    # Delete dependents first to satisfy FK constraints:
    # Feedback.qa_id -> user_sessions.id, then QAHistory by thread_id.
    await db.execute(delete(Feedback).where(Feedback.qa_id == session.id))
    if thread_id:
        await db.execute(delete(QAHistory).where(QAHistory.thread_id == thread_id))
    await db.delete(session)
    await db.commit()

    return {"code": 0, "message": "ok", "data": None}
