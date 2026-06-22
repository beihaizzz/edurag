"""QA API — LangGraph SSE streaming endpoint + session management"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Integer, cast, delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.deps import get_current_user
from app.graph.builder import build_rag_graph
from app.graph.state import RAGState
from app.models import Document, Feedback, QAHistory, User, UserSession
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.search import QaCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["qa"])

# Server-side timezone used to interpret naive datetimes coming out of
# ``DateTime`` (no-tz) columns. PG's ``func.now()`` writes naive values
# in the server's ``timezone`` setting; we mirror that here so we can
# convert back to absolute UTC for the API.
_SERVER_TZ = ZoneInfo(settings.SERVER_TIMEZONE)


def _iso_utc(dt: datetime | None) -> str | None:
    """Serialize a (possibly naive) datetime as an ISO-8601 UTC string.

    Legacy rows store ``DateTime`` columns without ``timezone=True``, so
    SQLAlchemy returns naive ``datetime`` objects whose wall-clock value
    is in the database server's local timezone (``settings.SERVER_TIMEZONE``).
    We localise to that tz, convert to UTC, then emit a ``Z``-suffixed
    ISO string so JavaScript's ``new Date()`` parses it as an absolute
    instant instead of as the user's local time.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_SERVER_TZ)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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

    async def _persist_turn(
        *,
        state_values: dict,
        latency_ms: int,
    ) -> QAHistory | None:
        """Persist this turn to qa_history and bump session.updated_at.

        Called from inside ``event_stream`` after the LangGraph run finishes
        OR from the ``finally`` block when the SSE stream is aborted /
        errored mid-flight, so a partially-completed turn still:

        1. Appears in the sidebar at the correct position
           (``UserSession.updated_at`` is refreshed).
        2. Shows up in ``GET /qa/sessions/{id}`` with whatever
           ``chat_history`` LangGraph managed to checkpoint.
        3. Has a row in ``qa_history`` for the flat history page (even
           if ``answer`` is empty).

        Wrapped in ``asyncio.shield`` by the caller so the DB writes
        themselves can't be cancelled by the same abort that triggered
        the persistence.
        """
        try:
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

            # Bump session.updated_at so the sidebar (ordered by updated_at desc)
            # surfaces the most-recently-touched session first, including aborted ones.
            # Use func.now() to match the timezone semantics of server_default=func.now()
            # on this `DateTime` (no tz) column — the DB converts UTC → session tz
            # (Asia/Shanghai in dev) before stripping the tz info. Mixing in
            # datetime.utcnow() here would store 8h-offset values that break sort order.
            await db.refresh(session_record)
            session_record.updated_at = func.now()
            await db.commit()

            return qa_record
        except Exception:
            logger.exception("Failed to persist turn for thread %s", thread_id)
            return None

    # Hoisted to the handler scope so both event_stream() and the
    # _persist_on_abort background task can compute the same latency.
    start_time = time.perf_counter()

    async def _persist_on_abort(*, thread_id_: str) -> None:
        """Persist a turn from a brand-new DB session after SSE abort.

        Background task spawned from the ``finally`` block when the SSE
        generator is torn down (e.g. client clicked "新对话" mid-stream).
        The request-scoped ``db`` is closed by FastAPI by the time we
        run, so we open our own session here and re-fetch the
        ``UserSession`` row by ``thread_id``.

        Reads the latest LangGraph checkpoint to capture whatever the
        graph managed to complete before being cancelled.
        """
        try:
            graph = await build_rag_graph()
            try:
                snap = await graph.aget_state({"configurable": {"thread_id": thread_id_}})
                state_values = snap.values if snap else {}
            except Exception:
                logger.exception("aget_state failed during abort persist for %s", thread_id_)
                state_values = {}

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            async with AsyncSessionLocal() as bg_db:
                # Locate the session row by thread_id (id may not be known yet
                # if the persistence happens before any prior commit).
                sess_stmt = select(UserSession).where(UserSession.thread_id == thread_id_)
                sess = (await bg_db.execute(sess_stmt)).scalar_one_or_none()
                if sess is None:
                    logger.warning("Abort persist: UserSession %s not found", thread_id_)
                    return

                if regenerate:
                    stale_stmt = (
                        select(QAHistory)
                        .where(QAHistory.thread_id == thread_id_, QAHistory.user_id == sess.user_id)
                        .order_by(desc(QAHistory.id))
                        .limit(1)
                    )
                    stale_record = (await bg_db.execute(stale_stmt)).scalar_one_or_none()
                    if stale_record:
                        await bg_db.delete(stale_record)
                        await bg_db.commit()

                qa_record = QAHistory(
                    user_id=sess.user_id,
                    course_id=course_id,
                    thread_id=thread_id_,
                    question=question,
                    answer=state_values.get("answer", ""),
                    sources=state_values.get("sources", []),
                    is_rejected=state_values.get("is_rejected", False),
                    latency_ms=latency_ms,
                )
                bg_db.add(qa_record)
                sess.updated_at = func.now()  # see _persist_turn for tz rationale
                await bg_db.commit()
                logger.info("Persisted aborted turn for thread %s", thread_id_)
        except Exception:
            logger.exception("Background persist-on-abort failed for thread %s", thread_id_)

    async def event_stream():
        persisted = False  # guard against double-write between normal and finally paths
        latest_state_values: dict = {}

        async def _save_once() -> QAHistory | None:
            """Read LangGraph state, persist QAHistory + updated_at. Idempotent."""
            nonlocal persisted, latest_state_values
            if persisted:
                return None
            persisted = True
            try:
                graph = await build_rag_graph()
                snap = await graph.aget_state({"configurable": {"thread_id": thread_id}})
                latest_state_values = snap.values if snap else {}
            except Exception:
                logger.exception("Failed to read LangGraph state for thread %s", thread_id)
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            # Shield from cancellation: if the client just aborted, we MUST
            # still finish the DB write or the session is stuck with stale
            # updated_at and an empty qa_history.
            return await asyncio.shield(
                _persist_turn(state_values=latest_state_values, latency_ms=latency_ms)
            )

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

                        elif node_name == "rewrite_query":
                            # Tell the frontend whether the LLM was actually invoked.
                            # passthrough (was_rewritten=False) means the frontend can
                            # skip the progress message entirely to avoid visual noise.
                            was_rewritten = node_output.get("query_was_rewritten", False)
                            rewritten = node_output.get("rewritten_question", "")
                            yield f"event: rewrite\ndata: {json.dumps({'was_rewritten': was_rewritten, 'rewritten': rewritten})}\n\n"

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

                # Normal path: stream finished, persist + emit done event.
                qa_record = await _save_once()

                is_rejected = latest_state_values.get("is_rejected", False)
                done_data = {
                    "answer": latest_state_values.get("answer", ""),
                    "sources": [] if is_rejected else latest_state_values.get("sources", []),
                    "is_rejected": is_rejected,
                    "rejection_reason": latest_state_values.get("rejection_reason", ""),
                    "id": qa_record.id if qa_record else None,
                    "session_id": session_record.id,
                    "thread_id": thread_id,
                }
                yield f"event: done\ndata: {json.dumps(done_data, default=str)}\n\n"

        except Exception as e:
            import traceback
            loop_info = f"loop={type(asyncio.get_running_loop()).__name__} policy={type(asyncio.get_event_loop_policy()).__name__}"
            detail = f"{type(e).__name__}: {e} | {loop_info}"
            logger.exception("SSE stream failed: %s", detail)
            yield f"event: error\ndata: {json.dumps({'error': 'internal_error', 'detail': detail, 'trace': traceback.format_exc()[-500:]})}\n\n"
        finally:
            # GeneratorExit (client abort) lands here too. We can't yield
            # anymore, and we can't `await` long operations because the
            # generator is being torn down — but we still MUST persist so
            # the aborted conversation appears with correct timestamp and
            # any partial chat_history.
            #
            # Solution: dispatch persistence as a fire-and-forget background
            # task on the running event loop. The task survives this
            # generator's teardown because it's owned by the loop, not the
            # generator. Note: the request-scoped `db` session is closed by
            # FastAPI after the response finishes, so we open a fresh
            # session inside the background coroutine.
            if not persisted:
                persisted = True  # prevent re-entry if finally is hit twice
                try:
                    asyncio.get_running_loop().create_task(
                        _persist_on_abort(thread_id_=thread_id)
                    )
                except RuntimeError:
                    # No running loop (extremely unlikely here). Best-effort: log.
                    logger.warning("No running loop to schedule abort persistence")

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
# GET /qa — list flat QAHistory records (for "问答历史" page)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/qa", response_model=APIResponse[PaginatedData])
async def list_qa_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    course_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List current user's flat QAHistory records, newest first (paginated).

    Powers the student "问答历史" page (`/student/history`). Unlike
    ``GET /qa/sessions`` which groups by ``user_sessions``, this returns
    every individual Q&A turn from the ``qa_history`` table.

    Course filtering matches by the **referenced source documents' course**,
    not by ``QAHistory.course_id`` (which records what the user picked at
    ask-time and is often null). We expand ``sources`` JSONB → extract
    ``document_id`` → join ``documents`` → filter by ``documents.course_id``.
    """
    offset = (page - 1) * page_size

    base_filters = [QAHistory.user_id == user.id]

    if course_id is not None:
        # Course filter is a correlated EXISTS: keep the QAHistory row if
        # any element in its `sources` JSONB array references a document
        # belonging to the requested course.
        #
        # Generated SQL (roughly):
        #   EXISTS (
        #     SELECT 1
        #     FROM jsonb_array_elements(qa_history.sources) AS src,
        #          documents d
        #     WHERE d.id = (src->>'document_id')::int
        #       AND d.course_id = :course_id
        #   )
        src = func.jsonb_array_elements(QAHistory.sources).column_valued("src")
        course_exists = (
            select(1)
            .where(
                Document.id == cast(src.op("->>")("document_id"), Integer),
                Document.course_id == course_id,
            )
            .correlate(QAHistory)
            .exists()
        )
        base_filters.append(course_exists)

    count_stmt = select(func.count()).select_from(QAHistory).where(*base_filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(QAHistory)
        .where(*base_filters)
        .order_by(desc(QAHistory.created_at))
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    items = [
        {
            "id": r.id,
            "question": r.question,
            "answer": r.answer,
            "sources": r.sources,
            "is_rejected": r.is_rejected,
            "latency_ms": r.latency_ms or 0,
            "course_id": r.course_id,
            "created_at": _iso_utc(r.created_at),
        }
        for r in records
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
            "created_at": _iso_utc(s.created_at),
            "updated_at": _iso_utc(s.updated_at),
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
            "created_at": _iso_utc(session.created_at),
            "updated_at": _iso_utc(session.updated_at),
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
