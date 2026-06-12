"""Tavily web search client wrapper with timeout and graceful degradation"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def search_tavily(
    query: str,
    max_results: int = 5,
    timeout: float = 10.0,
) -> list[dict]:
    """Search the web via Tavily API."""
    api_key = settings.TAVILY_API_KEY
    if not api_key:
        logger.warning("TAVILY_API_KEY not set — web search disabled")
        return []

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)

        async def _do():
            response = await client.search_async(query=query, max_results=max_results)
            return response.get("results", [])

        results = await asyncio.wait_for(_do(), timeout=timeout)
        logger.debug("Tavily: %d results for '%s'", len(results), query)
        return results
    except asyncio.TimeoutError:
        logger.warning("Tavily timeout (%ss) for '%s'", timeout, query)
        return []
    except Exception:
        logger.exception("Tavily search failed for '%s'", query)
        return []
