"""Node 5: Answer generation via DeepSeek LLM (JSON mode with citations)"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.generate import GENERATE_SYSTEM_PROMPT
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

MAX_CHAT_HISTORY_TURNS = 5  # Keep last 5 conversation turns


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

    # Build system prompt with context injected
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
