"""Rejection endpoint — category-based response messages"""

from __future__ import annotations

import logging

from app.graph.state import RAGState

logger = logging.getLogger(__name__)

_REJECTION_MESSAGES = {
    "intent": "抱歉，无法回答此类问题。请提出与课程学习相关的问题。",
    "no_results": "抱歉，未找到与您问题相关的课程资料。请尝试使用更具体的关键词，或切换到其他课程检索。",
    "web_failed": "抱歉，内部资料和网络搜索均未能找到相关信息。请换个方式提问或联系教师获取更多资料。",
    "output_review": "抱歉，生成的回答未通过内容审核。请换个方式提问。",
}

_DEFAULT_REJECT = "抱歉，无法处理您的请求。请稍后重试。"


async def reject(state: RAGState) -> dict:
    """Return appropriate rejection message based on rejection_category."""
    category = state.get("rejection_category", "no_results")
    reason = _REJECTION_MESSAGES.get(category, _DEFAULT_REJECT)

    # For ATTACK intent, use a more generic message
    intent = state.get("intent", "")
    if intent == "ATTACK" and category == "intent":
        reason = "抱歉，无法处理该请求。"

    logger.info("Rejecting: category=%s, intent=%s", category, intent)
    return {
        "answer": reason,
        "is_rejected": True,
        "rejection_reason": reason,
        "rejection_category": category,
    }
