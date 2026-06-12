"""Graph-related test fixtures for RAG StateGraph integration tests.

Provides:
    compiled_graph          — Compiled RAG StateGraph with in-memory MemorySaver
    base_state              — Minimal valid RAGState dict with all fields
    real_llm_available      — pytest.mark.skipif for tests needing DEEPSEEK_API_KEY
    real_embedding_available — pytest.mark.skipif for tests needing SILICONFLOW_API_KEY
    tavily_available        — pytest.mark.skipif for tests needing TAVILY_API_KEY

Usage::

    from tests.fixtures import compiled_graph, base_state, real_llm_available

    @real_llm_available
    @pytest.mark.asyncio
    async def test_with_real_llm(compiled_graph, base_state):
        ...
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.core.config import settings


# ── pytest.mark skipif markers ─────────────────────────────────────────────

real_llm_available = pytest.mark.skipif(
    not settings.DEEPSEEK_API_KEY,
    reason="DEEPSEEK_API_KEY not set — skipping real LLM test",
)
"""Skip test if DEEPSEEK_API_KEY is not configured.

Applied as a decorator::

    @real_llm_available
    @pytest.mark.asyncio
    async def test_graph_with_llm(compiled_graph, base_state):
        ...
"""

real_embedding_available = pytest.mark.skipif(
    not settings.SILICONFLOW_API_KEY,
    reason="SILICONFLOW_API_KEY not set — skipping real embedding test",
)
"""Skip test if SILICONFLOW_API_KEY is not configured."""

tavily_available = pytest.mark.skipif(
    not settings.TAVILY_API_KEY,
    reason="TAVILY_API_KEY not set — skipping web search test",
)
"""Skip test if TAVILY_API_KEY is not configured."""


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def compiled_graph():
    """Build and compile the RAG StateGraph with in-memory MemorySaver.

    Patches ``get_checkpointer`` to avoid requiring a real PostgreSQL database.
    The returned graph is fully compiled with all 8 nodes and 4 conditional edges
    wired, ready for ``graph.ainvoke()`` or ``graph.astream()`` calls.

    Yields:
        CompiledLangGraph: A ``CompiledStateGraph`` instance backed by MemorySaver.

    Usage::

        async def test_happy_path(compiled_graph, base_state):
            result = await compiled_graph.ainvoke(
                base_state, {"configurable": {"thread_id": "test-1"}}
            )
            assert "is_rejected" in result
    """
    from langgraph.checkpoint.memory import MemorySaver

    with patch(
        "app.graph.builder.get_checkpointer",
        AsyncMock(return_value=MemorySaver()),
    ):
        from app.graph.builder import build_rag_graph

        graph = await build_rag_graph()
    return graph


@pytest.fixture
def base_state() -> dict:
    """Return a minimal valid RAGState dict with all fields set to their defaults.

    The ``RAGState`` TypedDict uses ``total=False``, so every field is optional.
    This fixture provides explicit defaults so tests can override only the fields
    they need.

    Returns:
        dict: A state dict suitable for passing to ``graph.ainvoke()``.
    """
    return {
        "question": "",
        "course_id": None,
        "use_web_search": False,
        "chat_history": [],
        "intent": "NORMAL",
        "internal_results": [],
        "document_titles": {},
        "has_internal_results": False,
        "context": "",
        "sources": [],
        "search_mode": "internal",
        "has_web_results": False,
        "answer": "",
        "review_result": "",
        "matched_sources": [],
        "is_rejected": False,
        "rejection_reason": "",
        "rejection_category": "",
    }
