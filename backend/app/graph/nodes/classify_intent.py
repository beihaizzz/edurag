"""Node 1: Intent classification — L0 regex + LLM"""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.intent_classify import INTENT_CLASSIFY_PROMPT
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

# L0: Simple prompt injection patterns (reused from old qa.py)
_INJECTION_RE = re.compile(
    r"(?:"
    r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?"
    r"|忘记\s*(?:之前的|所有)?\s*(?:指示|指令|提示)"
    r"|请忽略"
    r"|system\s*prompt"
    r"|你是一个"
    r"|DAN\s*模式"
    r"|###\s*[Ii]nstruction"
    r"|new\s+instructions?\s*:"
    r"|you\s+are\s+now"
    r"|现在你是一个"
    r"|forget\s+(?:all\s+)?(?:previous|prior)\s+instructions?"
    r")",
    re.IGNORECASE,
)


async def classify_intent(state: RAGState) -> dict:
    """Classify user question into NORMAL|CHEATING|SENSITIVE|ATTACK.
    
    L0: Regex check for obvious injection attacks.
    L1: LLM classification via DeepSeek (temperature=0).
    Fallback: Parse failure → NORMAL (avoid over-blocking).
    """
    question = state.get("question", "")

    # L0: Regex interception
    if _INJECTION_RE.search(question):
        logger.warning("L0 regex matched: potential injection attack")
        return {"intent": "ATTACK", "rejection_category": "intent"}

    # L1: LLM classification
    try:
        prompt = INTENT_CLASSIFY_PROMPT.format(question=question)
        label = await invoke_llm(
            [HumanMessage(content=prompt)],
            temperature=0,
            timeout=10.0,
        )
        label = label.upper()

        valid_labels = {"NORMAL", "CHEATING", "SENSITIVE", "ATTACK"}
        if label in valid_labels:
            logger.info("Intent classified: %s", label)
            result = {"intent": label}
            if label != "NORMAL":
                result["rejection_category"] = "intent"
            return result

        logger.warning("LLM returned unknown label: '%s', falling back to NORMAL", label)
        return {"intent": "NORMAL"}

    except Exception:
        logger.exception("Intent classification failed, falling back to NORMAL")
        return {"intent": "NORMAL"}
