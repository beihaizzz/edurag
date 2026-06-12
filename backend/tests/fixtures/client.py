"""HTTP client fixtures for API integration tests.

Provides httpx.AsyncClient wired directly to the FastAPI
ASGI app, avoiding network overhead.
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture
async def async_client(test_db):
    """httpx.AsyncClient against the FastAPI app with test DB override.

    - Overrides ``get_db`` dependency with the transactional ``test_db``
    - Creates an ``httpx.AsyncClient`` that communicates directly with
      the ASGI app (no real HTTP server)
    - Clears dependency overrides on teardown

    Usage::

        async def test_endpoint(async_client):
            response = await async_client.get("/api/v1/courses")
            assert response.status_code == 200
    """
    from app.core.database import get_db
    from main import app

    app.dependency_overrides[get_db] = lambda: test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
