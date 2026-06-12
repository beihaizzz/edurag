"""Node 5: Answer generation via DeepSeek LLM"""

from __future__ import annotations

import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.generate import GENERATE_SYSTEM_PROMPT
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

MAX_CHAT_HISTORY_TURNS = 5  # Keep last 5 conversation turns


async def generate_answer(state: RAGState) -> dict:
    """Generate answer using context + chat history via DeepSeek.
    
    Builds prompt: SystemPrompt → recent chat_history → HumanMessage(question + context)
    """
    question = state.get("question", "")
    context = state.get("context", "")
    chat_history = state.get("chat_history", [])
    search_mode = state.get("search_mode", "internal")

    # Build system prompt with context injected
    system_prompt = GENERATE_SYSTEM_PROMPT.format(context=context)

    # Build messages list
    messages = [SystemMessage(content=system_prompt)]

    # Add recent chat history (last N turns only for token efficiency)
    if chat_history:
        recent = chat_history[-(MAX_CHAT_HISTORY_TURNS * 2):]  # each turn = user + assistant
        for msg in recent:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))

    # Add current question + context hint
    user_message = f"Question: {question}\n\nSearch mode: {search_mode}"
    messages.append(HumanMessage(content=user_message))

    try:
        answer = await invoke_llm(messages, temperature=0.3, timeout=60.0)
        logger.info("Answer generated: %d chars", len(answer))
        return {"answer": answer}
    except Exception:
        logger.exception("Answer generation failed")
        return {"answer": "抱歉，答案生成过程中出现错误，请稍后重试。"}
