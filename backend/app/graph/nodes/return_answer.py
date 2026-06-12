"""Normal return endpoint — finalize answer + append to chat_history"""

from __future__ import annotations

import logging

from app.graph.state import RAGState

logger = logging.getLogger(__name__)


async def return_answer(state: RAGState) -> dict:
    """Finalize the answer: append current Q&A pair to chat_history for multi-turn memory."""
    answer = state.get("answer", "")
    question = state.get("question", "")

    # Build the history update (Annotated[list, operator.add] handles append)
    new_entries = [
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]

    current_history = state.get("chat_history", [])
    updated_history = current_history + new_entries

    logger.info(
        "Returning answer: %d chars, chat_history now %d turns",
        len(answer),
        len(updated_history) // 2,
    )

    return {
        "is_rejected": False,
        "chat_history": new_entries,  # operator.add appends these
    }
