"""Environment connectivity validation.

Standalone test file — no conftest.py fixtures required.
Each test checks whether an external dependency is reachable
and reports latency for diagnostics.
"""

from __future__ import annotations

import logging
import time
import uuid

import pytest

# Import app first to trigger WindowsSelectorEventLoopPolicy fix
# on Windows (psycopg async requires SelectorEventLoop).
import app  # noqa: F401
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── PostgreSQL ─────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.env_check
async def test_postgresql_connection() -> None:
    """Verify PostgreSQL is reachable and responds to queries."""
    from sqlalchemy import text

    try:
        t0 = time.perf_counter()
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1
        elapsed = time.perf_counter() - t0
        logger.info("PostgreSQL connection OK (%.2fs)", elapsed)
    except Exception as e:
        pytest.fail(
            f"PostgreSQL connection failed: {e}\n"
            f"Ensure PostgreSQL is running at {settings.DATABASE_URL}"
        )


# ── ChromaDB ───────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.env_check
async def test_chromadb_connection() -> None:
    """Verify ChromaDB PersistentClient works (create, write, read, delete)."""
    import chromadb

    try:
        t0 = time.perf_counter()
        client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        temp_name = f"env_check_{uuid.uuid4().hex[:8]}"
        collection = client.create_collection(name=temp_name)
        collection.add(
            ids=["1"],
            documents=["Hello, ChromaDB!"],
            metadatas=[{"source": "env_check"}],
        )
        results = collection.get(ids=["1"])
        assert len(results["ids"]) == 1
        assert results["documents"][0] == "Hello, ChromaDB!"
        client.delete_collection(name=temp_name)
        elapsed = time.perf_counter() - t0
        logger.info("ChromaDB connection OK (%.2fs)", elapsed)
    except Exception as e:
        pytest.fail(
            f"ChromaDB connection failed: {e}\n"
            f"Ensure ChromaDB persist directory exists: {settings.CHROMA_PERSIST_DIR}"
        )


# ── DeepSeek LLM API ───────────────────────────────────


@pytest.mark.skipif(
    not settings.DEEPSEEK_API_KEY,
    reason="DEEPSEEK_API_KEY not set",
)
@pytest.mark.asyncio
@pytest.mark.env_check
async def test_deepseek_api() -> None:
    """Verify DeepSeek LLM API is reachable with a minimal prompt."""
    from langchain_core.messages import HumanMessage

    from app.graph.llm import invoke_llm

    try:
        t0 = time.perf_counter()
        response = await invoke_llm(
            messages=[HumanMessage(content="Say 'Hello' in one word")],
            max_tokens=100,
            timeout=15.0,
        )
        assert response, "Empty response from DeepSeek API"
        elapsed = time.perf_counter() - t0
        logger.info("DeepSeek API OK (%.2fs): %s", elapsed, response[:80])
    except Exception as e:
        pytest.fail(
            f"DeepSeek API call failed: {e}\n"
            f"Check DEEPSEEK_API_KEY in your .env file"
        )


# ── SiliconFlow Embedding API ──────────────────────────


@pytest.mark.skipif(
    not settings.SILICONFLOW_API_KEY,
    reason="SILICONFLOW_API_KEY not set",
)
@pytest.mark.asyncio
@pytest.mark.env_check
async def test_siliconflow_embedding() -> None:
    """Verify SiliconFlow embedding API returns float vectors."""
    from app.utils.embedding import get_embedding

    try:
        t0 = time.perf_counter()
        emb = get_embedding()
        vector = emb.embed_query("test")
        elapsed = time.perf_counter() - t0
        assert isinstance(vector, list), "Embedding result should be a list"
        assert len(vector) > 0, "Embedding vector is empty"
        assert all(isinstance(v, float) for v in vector), (
            "All embedding dimensions should be floats"
        )
        logger.info(
            "SiliconFlow embedding OK (%.2fs, dim=%d)", elapsed, len(vector)
        )
    except Exception as e:
        pytest.fail(
            f"SiliconFlow embedding failed: {e}\n"
            f"Check SILICONFLOW_API_KEY in your .env file"
        )


# ── Tavily Web Search API (optional) ───────────────────


@pytest.mark.skipif(
    not settings.TAVILY_API_KEY,
    reason="TAVILY_API_KEY not set",
)
@pytest.mark.asyncio
@pytest.mark.env_check
async def test_tavily_api_optional() -> None:
    """Verify Tavily search API is reachable (optional — skipped if no key)."""
    from app.graph.web_search_client import search_tavily

    try:
        t0 = time.perf_counter()
        results = await search_tavily("test", max_results=1)
        elapsed = time.perf_counter() - t0
        assert isinstance(results, list), "Tavily should return a list"
        logger.info("Tavily API OK (%.2fs, %d results)", elapsed, len(results))
    except Exception as e:
        pytest.fail(
            f"Tavily API call failed: {e}\n"
            f"Check TAVILY_API_KEY in your .env file"
        )
