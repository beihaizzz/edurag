"""Node 1: Intent classification — L0 regex + LLM with pedagogical sub-intent"""

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

# Valid top-level categories returned by the classifier
_VALID_CATEGORIES = {"NORMAL", "CHITCHAT", "CHEATING", "SENSITIVE", "ATTACK"}

# Valid pedagogical sub-intents (only applicable when category == NORMAL).
# Default sub-intent when the LLM gives a bare ``NORMAL`` (no colon) or an
# unrecognized sub-intent — CONCEPT is the safest fallback because its
# answer shape (definition + mechanism + examples + applications) reasonably
# covers most academic questions.
_VALID_SUB_INTENTS = {"CONCEPT", "PROCEDURE", "REASONING", "COMPARISON", "EXAMPLE", "FOLLOWUP"}
_DEFAULT_SUB_INTENT = "CONCEPT"


def _parse_label(raw: str) -> tuple[str, str]:
    """Parse the LLM label into (intent, sub_intent).

    Accepts:
      - "NORMAL"              → ("NORMAL", "CONCEPT") — bare NORMAL, default sub-intent
      - "NORMAL:CONCEPT"      → ("NORMAL", "CONCEPT")
      - "NORMAL:FOLLOWUP"     → ("NORMAL", "FOLLOWUP")
      - "CHITCHAT" / "ATTACK" → (category, "") — no sub-intent for non-NORMAL
      - Anything else / parse failure → ("NORMAL", "CONCEPT")  (fail-open, do not over-block)
    """
    label = (raw or "").strip().upper()
    if not label:
        return "NORMAL", _DEFAULT_SUB_INTENT

    if ":" in label:
        cat, _, sub = label.partition(":")
        cat = cat.strip()
        sub = sub.strip()
        if cat == "NORMAL":
            if sub in _VALID_SUB_INTENTS:
                return "NORMAL", sub
            return "NORMAL", _DEFAULT_SUB_INTENT
        # Non-NORMAL with colon (e.g. "ATTACK:something") — keep only the category
        if cat in _VALID_CATEGORIES:
            return cat, ""
        return "NORMAL", _DEFAULT_SUB_INTENT

    # No colon: bare category label
    if label == "NORMAL":
        return "NORMAL", _DEFAULT_SUB_INTENT
    if label in _VALID_CATEGORIES:
        return label, ""
    return "NORMAL", _DEFAULT_SUB_INTENT


async def classify_intent(state: RAGState) -> dict:
    """Classify user question into intent + sub_intent.

    Top-level intent steers routing (reject vs continue). Sub-intent only
    applies to NORMAL questions and steers the downstream answer-generation
    prompt shape (CONCEPT / PROCEDURE / REASONING / COMPARISON / EXAMPLE /
    FOLLOWUP). See ``app.graph.prompts.intent_classify`` for the taxonomy.

    L0: Regex check for obvious injection attacks (no sub-intent applies).
    L1: LLM classification via DeepSeek (temperature=0).
    Fallback: Parse failure → NORMAL:CONCEPT (avoid over-blocking).
    """
    question = state.get("question", "")

    # L0: Regex interception
    if _INJECTION_RE.search(question):
        logger.warning("L0 regex matched: potential injection attack")
        return {"intent": "ATTACK", "rejection_category": "intent"}

    # L1: LLM classification
    try:
        prompt = INTENT_CLASSIFY_PROMPT.format(question=question)
        raw_label = await invoke_llm(
            [HumanMessage(content=prompt)],
            temperature=0,
            timeout=10.0,
        )

        intent, sub_intent = _parse_label(raw_label)

        if intent == "NORMAL":
            logger.info("Intent classified: NORMAL:%s (raw=%r)", sub_intent, raw_label.strip()[:40])
            return {"intent": "NORMAL", "sub_intent": sub_intent}

        logger.info("Intent classified: %s (raw=%r)", intent, raw_label.strip()[:40])
        result: dict = {"intent": intent}
        if intent == "CHITCHAT":
            result["rejection_category"] = "chitchat"
        else:
            result["rejection_category"] = "intent"
        return result

    except Exception:
        logger.exception("Intent classification failed, falling back to NORMAL:CONCEPT")
        return {"intent": "NORMAL", "sub_intent": _DEFAULT_SUB_INTENT}
