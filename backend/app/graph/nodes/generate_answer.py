"""Node 5: Answer generation via DeepSeek LLM (JSON mode with citations)"""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.generate import GENERATE_FALLBACK_PROMPT, GENERATE_SYSTEM_PROMPT
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


def _is_pure_followup(question: str) -> bool:
    """Return True if the question is a pure follow-up phrase (no semantic content of its own)."""
    return bool(_PURE_FOLLOWUP_RE.match(question)) and len(question) <= 12


async def generate_answer(state: RAGState) -> dict:
    """Generate answer using context + chat history via DeepSeek (JSON mode).

    Forces structured JSON output to guarantee citation presence:
    ``{"answer": "...[来源1]...", "citations": [1]}``

    Returns ``answer`` (display string) and filters ``sources`` to cited only.
    """
    question = state.get("question", "")
    context = state.get("context", "")
    chat_history = state.get("chat_history", [])
    search_mode = state.get("search_mode", "internal")
    sources = state.get("sources", [])

    # Build system prompt — use fallback if no context OR if the user's current
    # question is a pure follow-up phrase. Forcing the main prompt with low-
    # quality web context against a contentless question ("详细讲讲") makes
    # the LLM refuse with the no-information template; fallback prompt with
    # chat_history is far more reliable in that case.
    pure_followup = _is_pure_followup(question)
    use_fallback = (not context or not context.strip()) or pure_followup
    if use_fallback:
        system_prompt = GENERATE_FALLBACK_PROMPT
        # Drop sources too: in fallback mode the answer comes from AI knowledge,
        # not from the retrieved web/internal context, so citing them would be
        # misleading.
        if pure_followup and context:
            logger.info(
                "Forcing fallback prompt for pure-followup question %r (had %d chars of context)",
                question, len(context),
            )
            sources = []
    else:
        system_prompt = GENERATE_SYSTEM_PROMPT.format(context=context)

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
        logger.warning("LLM returned non-JSON despite response_format; raw=%s", raw[:200])
        return {"answer": raw}
    except Exception:
        logger.exception("Answer generation failed")
        return {"answer": "抱歉，答案生成过程中出现错误，请稍后重试。"}
