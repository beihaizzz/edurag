"""Node 6: Output review — citation check + LLM semantic review"""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage

from app.graph.llm import invoke_llm
from app.graph.prompts.review_output import REVIEW_OUTPUT_PROMPT
from app.graph.state import RAGState

logger = logging.getLogger(__name__)

# Matches [来源N] or [网络N] citation markers
_CITATION_RE = re.compile(r"\[(来源|网络)(\d+)\]")


def _mechanical_check(answer: str, sources: list[dict], search_mode: str) -> str | None:
    """Return REJECT reason string if citations are invalid, else None."""
    if not answer:
        return "empty_answer"

    citations = _CITATION_RE.findall(answer)
    source_indices = {s.get("index", 0) for s in sources}

    # If internal search mode, citations are expected
    if search_mode == "internal":
        if not citations:
            return "missing_citations"
        for _, num_str in citations:
            num = int(num_str)
            if num not in source_indices:
                return f"fake_citation: {num}"
        return None  # PASS

    # Web search mode: more lenient, just check for obviously fake citations
    if citations:
        max_index = max(source_indices) if source_indices else 0
        for _, num_str in citations:
            num = int(num_str)
            if num > max_index + 2:  # Allow slight offset
                return f"fake_citation: {num}"

    return None  # PASS


async def review_output(state: RAGState) -> dict:
    """Review generated answer for citation validity and content safety.
    
    Phase 1: Mechanical citation check (hard validation).
    Phase 2: LLM semantic review (safety + factuality).
    """
    answer = state.get("answer", "")
    sources = state.get("sources", [])
    search_mode = state.get("search_mode", "internal")
    question = state.get("question", "")

    # Phase 1: Mechanical check
    reject_reason = _mechanical_check(answer, sources, search_mode)
    if reject_reason:
        logger.warning("Mechanical check REJECT: %s", reject_reason)
        return {"review_result": "REJECT", "matched_sources": [], "rejection_category": "output_review"}

    # Phase 2: LLM semantic review
    try:
        prompt = REVIEW_OUTPUT_PROMPT.format(
            question=question,
            answer=answer,
            sources=str(sources),
        )
        label = await invoke_llm(
            [HumanMessage(content=prompt)],
            temperature=0,
            max_tokens=5,
            timeout=15.0,
        )
        label = label.upper()

        if label == "PASS":
            logger.info("LLM review: PASS")
            return {"review_result": "PASS", "matched_sources": sources}
        else:
            logger.warning("LLM review: REJECT (%s)", label)
            return {"review_result": "REJECT", "matched_sources": [], "rejection_category": "output_review"}

    except Exception:
        logger.exception("LLM review failed, defaulting to PASS")
        return {"review_result": "PASS", "matched_sources": sources}
