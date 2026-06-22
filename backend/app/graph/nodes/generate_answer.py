"""Node 5: Answer generation via DeepSeek LLM (JSON mode with citations)"""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.generate import (
    select_fallback_prompt,
    select_main_prompt,
)
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

MAX_CHAT_HISTORY_TURNS = 5  # Keep last 5 conversation turns

# Pure-pronoun / pure-continuation follow-ups. When the user's literal
# current-turn question contains essentially no semantic content of its
# own (e.g. "详细讲讲", "继续", "为什么"), citing web/internal context
# against that question makes the LLM refuse with the no-information
# template even though chat_history clearly says what to talk about.
# In that case we force the fallback prompt regardless of context, so
# the LLM is told explicitly: lean on history + your own knowledge.
#
# This regex is a safety net for cases where the upstream classifier
# missed the FOLLOWUP label (which it usually catches); we fall back to
# this lexical check so the "pure follow-up → fallback prompt" guard
# still triggers correctly.
_PURE_FOLLOWUP_RE = re.compile(
    r"^\s*(?:"
    r"详细(?:讲讲|说说|解释)?吗?"
    r"|(?:再|继续|然后|接着)\s*(?:讲讲|说说|说|讲)?"
    r"|举(?:个例子|例)"
    r"|为什么|为何"
    r"|怎么(?:讲|说|回事)?"
    r"|还有(?:吗|呢)?"
    r"|嗯|好|对|哦"
    r")\s*[?？。.！!]*\s*$",
)


def _is_pure_followup(question: str, sub_intent: str = "") -> bool:
    """Return True if the question is a pure follow-up.

    Prefers the upstream classifier's sub_intent label (FOLLOWUP) when
    available; falls back to the lexical regex check for robustness when
    the classifier missed the label.
    """
    if sub_intent.upper() == "FOLLOWUP":
        return True
    return bool(_PURE_FOLLOWUP_RE.match(question)) and len(question) <= 12


# Matches an "answer" key in a (possibly malformed) JSON-ish blob:
#   "answer": "the actual answer text..."
# Captures everything up to the next unescaped quote that closes the value.
# This is a recovery path for when json.loads fails on real newlines inside
# string values — happens occasionally with DeepSeek even with json_object mode.
_JSON_ANSWER_RE = re.compile(
    r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)"',
    re.DOTALL,
)

# Strip surrounding JSON-object syntax when ALL recovery has failed, so the
# user doesn't see `{"answer": "..."` literally. This is a best-effort cleanup.
_JSON_OBJECT_WRAP_RE = re.compile(
    r'^\s*\{\s*"answer"\s*:\s*"?(.*?)"?\s*,?\s*"citations"\s*:\s*\[[^\]]*\]\s*\}\s*$',
    re.DOTALL,
)


def _extract_answer_from_broken_json(raw: str) -> str:
    """Best-effort: pull the 'answer' field's value out of a malformed JSON string.

    Returns the unescaped answer text on success, or empty string on failure.
    Handles common JSON escape sequences (\\n, \\t, \\", \\\\) found in
    LLM-generated output.
    """
    match = _JSON_ANSWER_RE.search(raw)
    if not match:
        return ""
    text = match.group(1)
    # Unescape common sequences. We avoid full json.loads on the captured
    # string because the original failure was due to invalid escapes/newlines.
    text = (
        text
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\\\", "\\")
    )
    return text.strip()


def _strip_json_wrapping(raw: str) -> str:
    """Last-ditch cleanup: if raw looks like a JSON object literal, strip the wrapping.

    Returns the inner answer text on match, or the original raw text on
    failure. This ensures the user never sees literal ``{"answer":`` syntax
    even when both json.loads and regex extraction fail.
    """
    match = _JSON_OBJECT_WRAP_RE.match(raw)
    if match:
        return match.group(1).strip()
    return raw.strip()


async def generate_answer(state: RAGState) -> dict:
    """Generate answer using context + chat history via DeepSeek (JSON mode).

    Forces structured JSON output to guarantee citation presence:
    ``{"answer": "...[来源1]...", "citations": [1]}``

    The prompt template is chosen by the sub_intent (CONCEPT/PROCEDURE/
    REASONING/COMPARISON/EXAMPLE/FOLLOWUP) set by ``classify_intent``, so
    each pedagogical question type gets its own structured answer shape.
    Unknown/empty sub_intent falls back to CONCEPT (the safest default).

    Returns ``answer`` (display string) and filters ``sources`` to cited only.
    """
    question = state.get("question", "")
    context = state.get("context", "")
    chat_history = state.get("chat_history", [])
    search_mode = state.get("search_mode", "internal")
    sources = state.get("sources", [])
    sub_intent = state.get("sub_intent", "") or "CONCEPT"
    query_was_rewritten = state.get("query_was_rewritten", False)

    # Build system prompt:
    # 1. No real context → fallback (AI knowledge)
    # 2. Pure follow-up question WITHOUT a successful rewrite → fallback
    #    even WITH context, because citing search hits done against a
    #    contentless query ("继续讲讲") makes the LLM refuse with the
    #    no-info template.
    # 3. Pure follow-up WITH a successful rewrite → MAIN prompt: the
    #    rewrite_query node produced a concrete query like "链表的详细
    #    原理", so the retrieved context IS relevant to the user's
    #    actual intent — we want the LLM to cite it.
    # 4. Real context AND real question → main prompt with citations
    pure_followup = _is_pure_followup(question, sub_intent)
    has_context = bool(context and context.strip())
    # A pure follow-up is only "stranded" (forces fallback even with context)
    # when the rewriter didn't help — i.e. the context was searched using the
    # raw contentless question. If rewrite succeeded, treat the context as
    # legitimate retrieval against the rewritten query.
    stranded_followup = pure_followup and not query_was_rewritten
    use_fallback = (not has_context) or stranded_followup

    if use_fallback:
        system_prompt = select_fallback_prompt(sub_intent)
        logger.info(
            "generate_answer: using FALLBACK prompt for sub_intent=%s "
            "(context=%d chars, pure_followup=%s, rewritten=%s)",
            sub_intent, len(context or ""), pure_followup, query_was_rewritten,
        )
        # Drop sources only when we're genuinely answering from AI knowledge
        # (stranded follow-up). When rewrite succeeded, sources WERE relevant
        # so the MAIN branch keeps them — we never reach this branch in that
        # case, but the inner condition is preserved for clarity.
        if stranded_followup and context:
            sources = []
    else:
        system_prompt = select_main_prompt(sub_intent).format(context=context)
        logger.info(
            "generate_answer: using MAIN prompt for sub_intent=%s "
            "(context=%d chars, sources=%d, search_mode=%s, rewritten=%s)",
            sub_intent, len(context), len(sources), search_mode, query_was_rewritten,
        )

    # Build messages list
    messages: list = [SystemMessage(content=system_prompt)]

    # Add recent chat history (last N turns only for token efficiency)
    if chat_history:
        recent = chat_history[-(MAX_CHAT_HISTORY_TURNS * 2):]
        for msg in recent:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))

    # Add current question
    user_message = f"Question: {question}\n\nSearch mode: {search_mode}"
    messages.append(HumanMessage(content=user_message))

    try:
        raw = await invoke_llm(
            messages,
            temperature=0,
            # DeepSeek docs explicitly warn: "Set max_tokens high enough that
            # the output cannot be truncated mid-object" when using JSON mode.
            # Without this cap the API uses an internal default that produces
            # short answers; 4096 is comfortable for our citation-wrapped JSON
            # responses while staying well within model limits (V4 → 384K max).
            max_tokens=4096,
            timeout=60.0,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        logger.info("Answer generated: %d chars (raw)", len(raw))

        # Parse JSON response
        parsed = json.loads(raw)
        answer = parsed.get("answer", "")
        citation_indices: list[int] = parsed.get("citations", [])

        # Filter sources to only those actually cited
        cited_sources = [
            s for s in sources
            if s.get("index") in citation_indices
        ]

        logger.info(
            "Parsed: answer=%d chars, citations=%s, cited_sources=%d",
            len(answer), citation_indices, len(cited_sources),
        )

        return {
            "answer": answer,
            "sources": cited_sources,
        }

    except json.JSONDecodeError:
        # DeepSeek's response_format=json_object isn't always honored. When
        # the LLM returns malformed JSON (e.g. real newlines inside string
        # values), strict json.loads fails. Two recovery strategies before
        # giving up and dumping raw JSON as the answer text:
        #
        # 1. Try lenient parse: extract the "answer" field with a regex
        # 2. Fall back to the raw text (least bad option — answer at least
        #    contains the content, even if wrapped in JSON syntax)
        logger.warning("LLM returned non-JSON despite response_format; raw=%s", raw[:200])
        recovered = _extract_answer_from_broken_json(raw)
        if recovered:
            logger.info("Recovered answer from malformed JSON (%d chars)", len(recovered))
            return {"answer": recovered, "sources": []}
        # Final fallback: strip leading/trailing JSON braces if present so the
        # user at least doesn't see raw JSON syntax
        cleaned = _strip_json_wrapping(raw)
        return {"answer": cleaned, "sources": []}
    except Exception:
        logger.exception("Answer generation failed")
        return {"answer": "抱歉，答案生成过程中出现错误，请稍后重试。"}
