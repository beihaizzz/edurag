"""Boundary tests: error handling and graceful degradation.

Tests document KNOWN degradation behaviors per design decision:
  「avoid over-blocking」— failures fall back to safe defaults instead of crashing.

Coverage:
  1. classify_intent with invalid DEEPSEEK_API_KEY → NORMAL fallback
  2. rag_search with ChromaDB failure → empty results (silent degradation)
  3. Empty question → graceful handling (document current behavior)
  4. Graph execution with malformed/missing state → catches inside nodes
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings
from app.graph.nodes.classify_intent import classify_intent
from app.graph.nodes.rag_search import rag_search
from app.graph.builder import build_rag_graph


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════


def _mock_invoke_llm(response_text: str) -> AsyncMock:
    """Create a mock invoke_llm that returns ``response_text`` directly."""
    return AsyncMock(return_value=response_text)


# ═══════════════════════════════════════════════════════════════
# 1. classify_intent — LLM failure fallback
# ═══════════════════════════════════════════════════════════════


class TestClassifyIntentLLMFailure:
    """classify_intent degrades to NORMAL on any LLM failure.

    Design choice: avoid over-blocking.  When the intent classifier
    cannot reach DeepSeek (invalid/missing key, network down, timeout),
    the request proceeds as NORMAL rather than being blocked.
    """

    @pytest.mark.asyncio
    async def test_invalid_api_key_falls_back_to_normal(self, monkeypatch):
        """Set invalid DEEPSEEK_API_KEY → LLM call fails → fallback to NORMAL.

        Scenario: deploy environment has a typo in DEEPSEEK_API_KEY.
        The ChatDeepSeek constructor accepts the key but ainvoke() raises
        (typically ValueError / AuthenticationError).  classify_intent
        catches the exception and returns NORMAL so legitimate users are
        not blocked.
        """
        # Simulate the invalid key scenario
        monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "sk-invalid-key-deadbeef")

        with patch(
            "app.graph.nodes.classify_intent.invoke_llm"
        ) as mock_invoke:
            mock_invoke.side_effect = ValueError("Invalid API key")

            result = await classify_intent({"question": "什么是机器学习？"})

        assert result["intent"] == "NORMAL"
        assert "rejection_category" not in result  # NORMAL means no rejection

    @pytest.mark.asyncio
    async def test_llm_timeout_falls_back_to_normal(self):
        """LLM timeout → fallback to NORMAL (avoid over-blocking)."""
        with patch(
            "app.graph.nodes.classify_intent.invoke_llm"
        ) as mock_invoke:
            mock_invoke.side_effect = TimeoutError("Request timed out")

            result = await classify_intent({"question": "解释一下反向传播"})

        assert result["intent"] == "NORMAL"

    @pytest.mark.asyncio
    async def test_llm_connection_error_falls_back_to_normal(self):
        """LLM connection error → fallback to NORMAL."""
        with patch(
            "app.graph.nodes.classify_intent.invoke_llm"
        ) as mock_invoke:
            mock_invoke.side_effect = ConnectionError("Connection refused")

            result = await classify_intent({"question": "什么是RAG？"})

        assert result["intent"] == "NORMAL"


# ═══════════════════════════════════════════════════════════════
# 2. rag_search — ChromaDB failure (silent degradation)
# ═══════════════════════════════════════════════════════════════


class TestRagSearchChromaDBFailure:
    """rag_search returns empty results when ChromaDB is unreachable.

    Design choice: silent degradation.  The graph continues to route after
    rag_search; if has_internal_results is False and use_web_search is
    also False, the graph reaches the reject node with an appropriate
    "no results found" message.  The user is never shown an internal error.
    """

    @pytest.mark.asyncio
    async def test_chromadb_unavailable_returns_empty(self):
        """ChromaDB connection failure → graceful empty result.

        Simulates: ChromaDB server down, disk full, collection corruption.
        rag_search catches any exception and returns has_internal_results=False
        with an empty results list.
        """
        with patch(
            "app.graph.nodes.rag_search.vector_store"
        ) as mock_vs:
            mock_vs.search = AsyncMock(
                side_effect=RuntimeError("ChromaDB connection refused")
            )

            result = await rag_search({"question": "什么是机器学习？", "course_id": 1})

        assert result["has_internal_results"] is False
        assert result["internal_results"] == []

    @pytest.mark.asyncio
    async def test_chromadb_timeout_returns_empty(self):
        """ChromaDB query timeout → graceful empty result."""
        with patch(
            "app.graph.nodes.rag_search.vector_store"
        ) as mock_vs:
            mock_vs.search = AsyncMock(side_effect=TimeoutError("Query timeout"))

            result = await rag_search({"question": "深层神经网络结构"})

        assert result["has_internal_results"] is False
        assert result["internal_results"] == []

    @pytest.mark.asyncio
    async def test_chromadb_invalid_response_returns_empty(self):
        """ChromaDB returns malformed response → graceful empty result."""
        with patch(
            "app.graph.nodes.rag_search.vector_store"
        ) as mock_vs:
            mock_vs.search = AsyncMock(
                side_effect=TypeError("'NoneType' object is not iterable")
            )

            result = await rag_search(
                {"question": "transformer architecture", "course_id": None}
            )

        assert result["has_internal_results"] is False
        assert result["internal_results"] == []


# ═══════════════════════════════════════════════════════════════
# 3. Empty question — appropriate error
# ═══════════════════════════════════════════════════════════════


class TestEmptyQuestion:
    """Empty question handling at the graph-node level.

    NOTE: At the API layer, FastAPI + Pydantic rejects empty questions
    with HTTP 422 (``QaCreate.question`` has ``min_length=1``).  This
    happens BEFORE any graph execution — zero LLM API calls.

    At the graph-node level, classify_intent handles empty input
    gracefully: the default ``state.get("question", "")`` yields an
    empty string, which passes through L0 regex (no match) and reaches
    the LLM.  The LLM classifies it (current behavior) or fails, and
    the fallback returns NORMAL.
    """

    @pytest.mark.asyncio
    async def test_empty_question_does_not_crash(self):
        """Empty question in classify_intent → returns valid result (no crash)."""
        with patch(
            "app.graph.nodes.classify_intent.invoke_llm"
        ) as mock_invoke:
            mock_invoke.return_value = "NORMAL"

            result = await classify_intent({"question": ""})

        # Does not crash; returns valid classification
        assert "intent" in result
        assert result["intent"] in ("NORMAL", "CHEATING", "SENSITIVE", "ATTACK")

    @pytest.mark.asyncio
    async def test_empty_question_in_rag_search_returns_empty(self):
        """Empty question in rag_search → empty results (no meaningful query)."""
        with patch(
            "app.graph.nodes.rag_search.vector_store"
        ) as mock_vs:
            mock_vs.search = AsyncMock(return_value=[])

            result = await rag_search({"question": "", "course_id": None})

        assert result["has_internal_results"] is False
        assert result["internal_results"] == []


# ═══════════════════════════════════════════════════════════════
# 4. Graph execution with malformed/missing state
# ═══════════════════════════════════════════════════════════════


class TestMalformedStateGraphExecution:
    """Graph handles missing keys gracefully via .get() defaults.

    Every node uses ``state.get(key, default)`` patterns, so a graph
    invocation with missing state fields still completes without throwing.
    """

    @pytest.fixture(scope="class")
    def graph(self):
        """Build compiled graph with in-memory MemorySaver."""
        from langgraph.checkpoint.memory import MemorySaver

        async def _build():
            with patch(
                "app.graph.builder.get_checkpointer",
                AsyncMock(return_value=MemorySaver()),
            ):
                return await build_rag_graph()

        return asyncio.run(_build())

    @pytest.mark.asyncio
    async def test_missing_question_handled_gracefully(self, graph):
        """Graph invoked with empty state → does not crash.

        All nodes use ``state.get(key, default)`` defensively.
        classify_intent defaults question to "".
        L0 regex doesn't match on "".
        The graph completes (likely with rejection) without internal error.
        """
        # Patch LLM to avoid real API call
        mock_cls = _mock_invoke_llm("NORMAL")

        with patch(
            "app.graph.nodes.classify_intent.invoke_llm",
            mock_cls,
        ):
            with patch(
                "app.graph.nodes.rag_search.vector_store"
            ) as mock_vs:
                mock_vs.search = AsyncMock(return_value=[])

                result = await graph.ainvoke(
                    {},  # completely empty state
                    {"configurable": {"thread_id": "test-malformed-1"}},
                )

        # Graceful handling — rejected because no results + no web search
        assert "is_rejected" in result
        assert "answer" in result

    @pytest.mark.asyncio
    async def test_partial_state_handled_gracefully(self, graph):
        """Graph with only question (missing optional keys) → completes normally.

        Missing: course_id, use_web_search, chat_history, etc.
        All optional and defaulted inside nodes.
        """
        mock_cls = _mock_invoke_llm("NORMAL")

        with patch(
            "app.graph.nodes.classify_intent.invoke_llm",
            mock_cls,
        ):
            with patch(
                "app.graph.nodes.rag_search.vector_store"
            ) as mock_vs:
                mock_vs.search = AsyncMock(return_value=[])

                result = await graph.ainvoke(
                    {"question": "什么是机器学习？"},
                    {"configurable": {"thread_id": "test-malformed-2"}},
                )

        # Graph completes; no crash
        assert "is_rejected" in result
        assert "answer" in result

    @pytest.mark.asyncio
    async def test_none_course_id_handled(self):
        """classify_intent with None course_id → no crash, LLM still called."""
        with patch(
            "app.graph.nodes.classify_intent.invoke_llm"
        ) as mock_invoke:
            mock_invoke.return_value = "NORMAL"

            # course_id missing entirely (key absent)
            result = await classify_intent({"question": "什么是深度学习？"})

        assert result["intent"] == "NORMAL"
