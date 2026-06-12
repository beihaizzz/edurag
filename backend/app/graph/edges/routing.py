"""Conditional routing functions for RAG graph edges"""

from __future__ import annotations

from app.graph.state import RAGState


def route_after_classify(state: RAGState) -> str:
    """After intent classification: route to rag_search or reject."""
    intent = state.get("intent", "NORMAL")
    if intent == "NORMAL":
        return "rag_search"
    return "reject"


def route_after_rag_search(state: RAGState) -> str:
    """After RAG search: route to build_context, web_search, or reject."""
    has_results = state.get("has_internal_results", False)
    use_web = state.get("use_web_search", False)

    if has_results:
        return "build_context"
    if use_web:
        return "web_search"
    return "reject"


def route_after_web_search(state: RAGState) -> str:
    """After web search: route to generate_answer or reject."""
    has_web = state.get("has_web_results", False)
    if has_web:
        return "generate_answer"
    return "reject"


def route_after_review(state: RAGState) -> str:
    """After output review: route to return_answer or reject."""
    result = state.get("review_result", "PASS")
    if result == "PASS":
        return "return_answer"
    return "reject"
