"""Tests for invoke_llm() retry behavior"""

import pytest
from unittest.mock import AsyncMock, patch


class TestInvokeLLMRetry:
    """Verify invoke_llm retries on network errors and correctly gives up."""

    @pytest.mark.asyncio
    async def test_retry_on_connection_error(self):
        """invoke_llm should retry on ConnectionError and succeed on 2nd try."""
        from app.graph.llm import invoke_llm
        from langchain_core.messages import HumanMessage

        # Fail once, succeed on retry
        success_response = AsyncMock()
        success_response.content = "retry succeeded"

        side_effects = [
            ConnectionError("network down"),
            success_response,
        ]
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(side_effect=side_effects)

        with patch("app.graph.llm.ChatDeepSeek", return_value=mock_llm):
            result = await invoke_llm(
                [HumanMessage(content="test")],
                temperature=0,
                max_tokens=10,
            )
            assert result == "retry succeeded"
            # Called twice: initial + 1 retry
            assert mock_llm.ainvoke.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_exhausts_after_3_failures(self):
        """invoke_llm should raise after 3 failed attempts."""
        from app.graph.llm import invoke_llm
        from langchain_core.messages import HumanMessage

        # Always fail
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(side_effect=ConnectionError("persistent"))

        with patch("app.graph.llm.ChatDeepSeek", return_value=mock_llm):
            with pytest.raises(ConnectionError, match="persistent"):
                await invoke_llm(
                    [HumanMessage(content="test")],
                    temperature=0,
                    max_tokens=10,
                )
            # 3 attempts total: initial + 2 retries
            assert mock_llm.ainvoke.call_count == 3

    @pytest.mark.asyncio
    async def test_no_retry_on_value_error(self):
        """ValueError should NOT be retried — fails immediately."""
        from app.graph.llm import invoke_llm
        from langchain_core.messages import HumanMessage

        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(side_effect=ValueError("bad param"))

        with patch("app.graph.llm.ChatDeepSeek", return_value=mock_llm):
            with pytest.raises(ValueError, match="bad param"):
                await invoke_llm(
                    [HumanMessage(content="test")],
                    temperature=0,
                    max_tokens=10,
                )
            # Only 1 attempt — no retry for ValueError
            assert mock_llm.ainvoke.call_count == 1

    @pytest.mark.asyncio
    async def test_classify_intent_fallback_after_llm_exhaustion(self):
        """After invoke_llm exhausts retries, classify_intent falls to NORMAL."""
        from app.graph.nodes.classify_intent import classify_intent

        mock_llm = AsyncMock()
        # Always fail — exhaust all 3 retries
        mock_llm.ainvoke = AsyncMock(side_effect=ConnectionError("timeout"))

        with patch("app.graph.llm.ChatDeepSeek", return_value=mock_llm):
            result = await classify_intent({
                "question": "what is machine learning"
            })
            # Fallback to NORMAL (safe default)
            assert result["intent"] == "NORMAL"
            # 3 attempts: initial + 2 retries
            assert mock_llm.ainvoke.call_count == 3
