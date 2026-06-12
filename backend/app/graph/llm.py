"""Unified DeepSeek LLM factory with exponential backoff retry"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import backoff
from langchain_core.messages import BaseMessage
from langchain_deepseek import ChatDeepSeek

from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

# Retryable network-level exceptions
_RETRYABLE_EXCEPTIONS = (ConnectionError, TimeoutError, OSError)

# Non-retryable exceptions (parameter errors, auth failures — retry is useless)
_NON_RETRYABLE_EXCEPTIONS = (ValueError, TypeError)


def _on_backoff(details: dict) -> None:
    """Log retry attempts with context."""
    exception = details.get("exception", "unknown")
    tries = details.get("tries", 0)
    logger.warning(
        "LLM call attempt %d failed: %s: %s",
        tries,
        type(exception).__name__,
        exception,
    )


async def invoke_llm(
    messages: "Sequence[BaseMessage]",
    *,
    temperature: float = 0.3,
    max_tokens: int | None = None,
    timeout: float = 30.0,
    model_kwargs: dict | None = None,
) -> str:
    """Call DeepSeek LLM with exponential backoff retry.

    Args:
        messages: LangChain message sequence (SystemMessage, HumanMessage, AIMessage, etc.)
        temperature: Sampling temperature (default 0.3)
        max_tokens: Maximum output tokens (None = model default)
        timeout: Request timeout in seconds (default 30)
        model_kwargs: Extra kwargs passed to ChatDeepSeek (e.g.
            ``{"response_format": {"type": "json_object"}}`` for JSON mode)

    Returns:
        Response content as stripped string

    Raises:
        ConnectionError: After exhausting all retries
        TimeoutError: After exhausting all retries
        OSError: After exhausting all retries
        ValueError: Immediately (not retried)
        TypeError: Immediately (not retried)
    """
    @backoff.on_exception(
        wait_gen=backoff.expo,
        exception=_RETRYABLE_EXCEPTIONS,
        max_tries=3,
        on_backoff=_on_backoff,
        jitter=backoff.full_jitter,
        raise_on_giveup=True,
        giveup=lambda e: isinstance(e, _NON_RETRYABLE_EXCEPTIONS),
    )
    async def _call() -> str:
        llm = ChatDeepSeek(
            model=settings.DEEPSEEK_MODEL,
            api_key=settings.DEEPSEEK_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            model_kwargs=model_kwargs or {},
        )
        response = await llm.ainvoke(list(messages))
        return response.content.strip()

    return await _call()
