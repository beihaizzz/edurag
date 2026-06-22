"""Node 1.5: Follow-up query rewriting with heuristic pre-filter + LLM expansion.

Placed between ``classify_intent`` and ``rag_search``. Only invokes the LLM
when the current question looks like a follow-up (short, contains deictic
references); otherwise passes through the original question verbatim.

This saves ~500ms and ~200 tokens on the common path where the user asks an
independent new question (e.g. "什么是快速排序" after "什么是堆排序").
"""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.graph.llm import invoke_llm
from app.graph.prompts.rewrite_query import REWRITE_QUERY_PROMPT
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

# ── Heuristic: cheap pre-filter for follow-up questions ─────────────────
# The LLM rewrite call is only triggered when the question looks like a
# follow-up. A question is a "suspected follow-up" when its length is short
# AND it contains follow-up signals (deictic references, short queries,
# continuation words, etc.).
#
# False positives (independent questions that look like follow-ups) are
# harmless — the LLM prompt explicitly preserves independent questions.

_FOLLOWUP_PATTERNS = re.compile(
    r"(?:"
    r"详细|继续|然后|还有|再|更|另外"
    r"|为什么|为何"
    r"|举个例子|举例|比如|例如"
    r"|它|这个|那个|这些|那些|它们"
    r"|怎么|如何|哪"
    r"|能.*吗"
    r"|还有吗"
    r"|对|哦|嗯|好"  # single-character continuations
    r")",
)

MAX_FOLLOWUP_CHARS = 30  # questions longer than this are almost certainly independent


async def rewrite_query(state: RAGState) -> dict:
    """Rewrite follow-up questions into self-contained search queries.

    Returns ``rewritten_question`` (the actual query to search with) and
    ``query_was_rewritten`` (whether the LLM was invoked — else the question
    was passed through unchanged).

    Exceptions in the LLM call are caught and treated as passthrough, so
    the pipeline never hard-fails on this node.
    """
    question: str = state.get("question", "")
    chat_history: list[dict] = state.get("chat_history", [])
    query_was_rewritten = False

    # Step 1: Quick bypass — no history → nothing to rewrite
    if not chat_history or not settings.QUERY_REWRITE_ENABLED:
        logger.debug(
            "Rewrite bypassed: history=%d, enabled=%s",
            len(chat_history) if chat_history else 0,
            settings.QUERY_REWRITE_ENABLED,
        )
        return {
            "rewritten_question": question,
            "query_was_rewritten": False,
        }

    # Step 2: Heuristic — does this look like a follow-up?
    is_short = len(question) <= MAX_FOLLOWUP_CHARS
    has_pattern = bool(_FOLLOWUP_PATTERNS.search(question))

    if not (is_short and has_pattern):
        logger.debug(
            "Rewrite passthrough: short=%s, pattern=%s (question=%r)",
            is_short, has_pattern, question[:40],
        )
        return {
            "rewritten_question": question,
            "query_was_rewritten": False,
        }

    # Step 3: Need LLM — format chat history
    history_turns = settings.QUERY_REWRITE_HISTORY_TURNS
    recent = chat_history[-(history_turns * 2):]  # each turn = user + assistant

    history_lines: list[str] = []
    for msg in recent:
        role = "用户" if msg.get("role") == "user" else "助手"
        content = msg.get("content", "")
        # Truncate assistant answers (long content) for token efficiency
        if msg.get("role") == "assistant" and len(content) > 200:
            content = content[:200] + "…"
        history_lines.append(f"{role}：{content}")

    history_text = "\n".join(history_lines)
    prompt = REWRITE_QUERY_PROMPT.format(
        history=history_text,
        question=question,
    )

    # Step 4: LLM rewrite call (one HumanMessage — the prompt is self-contained)
    try:
        rewritten = await invoke_llm(
            [SystemMessage(content="你是一个查询改写助手，只输出改写后的查询文本。"), HumanMessage(content=prompt)],
            temperature=0,
            max_tokens=128,
            timeout=10.0,
        )
        rewritten = rewritten.strip().strip('"').strip("'")
        query_was_rewritten = True

        # Sanity: if the LLM returns something empty or absurdly long, use original
        if not rewritten or len(rewritten) > 500:
            logger.warning("Rewrite result invalid (empty/too long), falling back to original")
            rewritten = question
            query_was_rewritten = False

        logger.info(
            "Query rewritten: %r → %r (was_rewritten=%s)",
            question[:60], rewritten[:80], query_was_rewritten,
        )
    except Exception:
        logger.exception("Query rewrite LLM call failed, falling back to original")
        rewritten = question
        query_was_rewritten = False

    return {
        "rewritten_question": rewritten,
        "query_was_rewritten": query_was_rewritten,
    }