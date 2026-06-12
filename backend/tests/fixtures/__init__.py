"""Test fixtures package.

All fixtures are imported by the root conftest.py and thus
available to every test under ``tests/``.

Fixtures:
    test_db             - Real PostgreSQL session with transaction rollback
    async_client        - httpx.AsyncClient wired to FastAPI ASGI app
    reset_db            - Clean test data marker
    init_test_data      - Seed admin user + course
    create_test_user    - Factory: create a real User + JWT token

    student_token       - JWT access_token for a student user
    teacher_token       - JWT access_token for a teacher user
    admin_token         - JWT access_token for an admin user
    auth_headers        - {"Authorization": "Bearer {student_token}"} dict
    expired_token       - Expired JWT access token (no DB needed)
    refresh_token_str   - JWT refresh_token for a student user
    disabled_user_token - JWT access_token for a disabled user
    compiled_graph      - Compiled RAG StateGraph with in-memory MemorySaver
    base_state          - Minimal valid RAGState dict
    real_llm_available          - pytest.mark.skipif for DEEPSEEK_API_KEY
    real_embedding_available    - pytest.mark.skipif for SILICONFLOW_API_KEY
    tavily_available            - pytest.mark.skipif for TAVILY_API_KEY
    sample_txt_file             - .txt with ~500 chars of Chinese academic content
    sample_pdf_file             - minimal valid .pdf via raw PDF bytes
    sample_docx_file            - minimal valid .docx via zipfile
    sample_large_file           - file exceeding MAX_UPLOAD_SIZE_MB (413 testing)
    sample_unsupported_file     - .exe file (unsupported-extension testing)
    uploaded_document           - POST /api/v1/documents → response JSON
    approved_document           - approve uploaded doc via admin → approved doc
    processed_document          - process + approve → fully processed doc
"""

import uuid

import pytest_asyncio

from tests.fixtures.auth import (  # noqa: F401
    admin_token,
    auth_headers,
    disabled_user_token,
    expired_token,
    refresh_token_str,
    student_token,
    teacher_token,
)
from tests.fixtures.client import async_client  # noqa: F401
from tests.fixtures.db import init_test_data, reset_db, test_db  # noqa: F401
from tests.fixtures.documents import (  # noqa: F401
    approved_document,
    processed_document,
    sample_docx_file,
    sample_large_file,
    sample_pdf_file,
    sample_txt_file,
    sample_unsupported_file,
    uploaded_document,
)
from tests.fixtures.graph import (  # noqa: F401
    base_state,
    compiled_graph,
    real_embedding_available,
    real_llm_available,
    tavily_available,
)


@pytest_asyncio.fixture
async def create_test_user(test_db):
    """Factory fixture: create a test user with a valid JWT access token.

    Creates a real User row in the test database and returns both
    the User ORM object and a signed JWT access_token.

    Args:
        role: One of "student" (default), "teacher", "admin"
        username: Optional fixed username; auto-generated if omitted
        password: Plain-text password (default: "Test@123456")

    Returns:
        tuple: (User, str) — the User ORM object and a JWT access_token

    Usage::

        async def test_protected_endpoint(create_test_user):
            user, token = await create_test_user(role="teacher")
            headers = {"Authorization": f"Bearer {token}"}
            ...
    """

    from app.core.security import create_access_token, hash_password
    from app.models.user import User

    async def _create(role="student", username=None, password="Test@123456"):
        if username is None:
            username = f"u_{uuid.uuid4().hex[:8]}"

        user = User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            real_name=f"Test {role}",
            email=f"{username}@test.local",
        )
        test_db.add(user)
        await test_db.flush()
        await test_db.refresh(user)

        token = create_access_token({"sub": str(user.id)})
        return user, token

    return _create


__all__ = [
    "admin_token",
    "approved_document",
    "async_client",
    "auth_headers",
    "base_state",
    "compiled_graph",
    "create_test_user",
    "disabled_user_token",
    "expired_token",
    "init_test_data",
    "processed_document",
    "real_embedding_available",
    "real_llm_available",
    "refresh_token_str",
    "reset_db",
    "sample_docx_file",
    "sample_large_file",
    "sample_pdf_file",
    "sample_txt_file",
    "sample_unsupported_file",
    "student_token",
    "tavily_available",
    "teacher_token",
    "test_db",
    "uploaded_document",
]
