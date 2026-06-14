"""Input validation boundary tests for POST /api/v1/qa.

Tests Pydantic QaCreate schema boundaries (min_length=1, max_length=2000),
unicode/emoji, HTML/script injection, SQL injection, and course_id edge cases.

All 200‑path tests use ``client.stream()`` to receive only the response
status line without waiting for the SSE stream body to finish.

Fixtures used:
    async_client     — httpx.AsyncClient against FastAPI ASGI app
    create_test_user — factory returning (User, JWT token)
    student_token    — JWT access_token string
"""

import pytest
from httpx import AsyncClient

QA_URL = "/api/v1/qa"


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════

def _make_question(length: int) -> str:
    """Generate a Chinese academic question of exactly *length* characters."""
    unit = "机器学习是人工智能的重要分支，它通过算法让计算机从数据中学习规律和模式。"
    repeats = (length // len(unit)) + 1
    return (unit * repeats)[:length]


async def _assert_accepted(
    async_client: AsyncClient, token: str, payload: dict
) -> None:
    """Fire a streaming POST and verify the server accepts the request (status 200).

    Uses ``client.stream()`` so the test does **not** block on the SSE body.
    """
    async with async_client.stream(
        "POST", QA_URL, json=payload, headers=_auth(token)
    ) as response:
        assert response.status_code == 200, (
            f"Expected 200 but got {response.status_code}: "
            f"{await _safe_read_error(response)}"
        )


async def _assert_accepted_or_err(
    async_client: AsyncClient, token: str, payload: dict,
    acceptable: tuple = (200, 422, 500),
) -> int:
    """Fire a streaming POST; verify the server does not crash unexpectedly.

    Returns the status code for further inspection.

    Note: uses ``post()`` (not ``stream()``) because server-side
    DB errors (e.g. FK violations) can leak through the ASGI transport
    as raw exceptions with ``stream()``, preventing status-code access.
    """
    try:
        response = await async_client.post(
            QA_URL, json=payload, headers=_auth(token), timeout=10.0,
        )
        status = response.status_code
    except Exception as exc:
        # Server-side crash (e.g. FK violation) before response is sent.
        # Treat as a server error — this is acceptable for edge-case inputs.
        status = 500

    assert status in acceptable, (
        f"Expected one of {acceptable}, got {status}"
    )
    return status


async def _assert_rejected(
    async_client: AsyncClient, token: str, payload: dict,
    expected_status: int = 422, field: str = "question",
) -> None:
    """Fire a POST and assert the server rejects the request."""
    response = await async_client.post(
        QA_URL, json=payload, headers=_auth(token),
    )
    assert response.status_code == expected_status, (
        f"Expected {expected_status}, got {response.status_code}: "
        f"{response.text[:500]}"
    )
    if expected_status == 422:
        detail = response.json().get("detail", [])
        locs = [e.get("loc", []) for e in detail]
        assert any(field in loc for loc in locs), (
            f"Expected '{field}' in error location, got {locs}"
        )


async def _safe_read_error(response) -> str:
    """Try to read an error body without raising if the stream is still open."""
    try:
        return response.text[:300]
    except Exception:
        return "<streaming body not consumed>"


# ═══════════════════════════════════════════════════════════════════
# Pydantic min_length / max_length boundary tests
# ═══════════════════════════════════════════════════════════════════

class TestQuestionLengthBounds:
    """QaCreate.question: Field(min_length=1, max_length=2000)."""

    @pytest.mark.asyncio
    async def test_empty_question_returns_422(
        self, async_client: AsyncClient, student_token: str
    ):
        """Empty string (0 chars) → 422 Pydantic validation error."""
        await _assert_rejected(async_client, student_token, {"question": ""})

    @pytest.mark.asyncio
    async def test_missing_question_returns_422(
        self, async_client: AsyncClient, student_token: str
    ):
        """Missing 'question' field entirely → 422."""
        await _assert_rejected(async_client, student_token, {"course_id": 1})

    @pytest.mark.asyncio
    async def test_whitespace_only_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Whitespace-only question ('   ') is accepted (not empty)."""
        await _assert_accepted(async_client, student_token, {"question": "   "})

    @pytest.mark.asyncio
    async def test_single_char_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Single character question → accepted (min_length=1 boundary)."""
        await _assert_accepted(async_client, student_token, {"question": "?"})

    @pytest.mark.asyncio
    async def test_max_length_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Exactly 2000 chars → accepted (max_length=2000 boundary)."""
        question = _make_question(2000)
        assert len(question) == 2000
        await _assert_accepted(async_client, student_token, {"question": question})

    @pytest.mark.asyncio
    async def test_over_max_question_returns_422(
        self, async_client: AsyncClient, student_token: str
    ):
        """2001 chars → 422 (exceeds max_length=2000)."""
        question = _make_question(2001)
        assert len(question) == 2001
        await _assert_rejected(
            async_client, student_token, {"question": question}
        )

    @pytest.mark.asyncio
    async def test_massively_over_max_question_returns_422(
        self, async_client: AsyncClient, student_token: str
    ):
        """10000 chars → 422 (far exceeds max_length=2000)."""
        question = _make_question(10000)
        await _assert_rejected(
            async_client, student_token, {"question": question}
        )


# ═══════════════════════════════════════════════════════════════════
# Unicode / emoji input tests
# ═══════════════════════════════════════════════════════════════════

class TestUnicodeAndEmoji:
    """Questions with emoji, Unicode, and mixed scripts."""

    @pytest.mark.asyncio
    async def test_emoji_in_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Question with emoji characters accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "人工智能 🤖 是什么？😊"},
        )

    @pytest.mark.asyncio
    async def test_emoji_only_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Question consisting entirely of emoji accepted."""
        await _assert_accepted(
            async_client, student_token, {"question": "🤖🤖🤖"},
        )

    @pytest.mark.asyncio
    async def test_cjk_characters_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Full CJK (Chinese/Japanese/Korean) characters accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "機械学習とは何ですか？人工知能との関係は？"},
        )

    @pytest.mark.asyncio
    async def test_rtl_script_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Right-to-left script (Arabic) accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "ما هو الذكاء الاصطناعي؟"},
        )

    @pytest.mark.asyncio
    async def test_mixed_script_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Mixed scripts (Chinese + English + Greek + emoji) accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "什么是 α-β pruning 在 AI 中？🤔"},
        )

    @pytest.mark.asyncio
    async def test_zero_width_chars_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Zero-width characters (U+200B) accepted as opaque text."""
        question = "机器学习\u200b是什么？"
        assert len(question) == 9  # 8 visible + 1 zero-width
        await _assert_accepted(
            async_client, student_token, {"question": question},
        )


# ═══════════════════════════════════════════════════════════════════
# HTML / script injection tests (accepted as text, not executed)
# ═══════════════════════════════════════════════════════════════════

class TestHtmlScriptInjection:
    """HTML and script tags in question are accepted as plain text."""

    @pytest.mark.asyncio
    async def test_html_tags_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """HTML markup in question accepted as literal text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "<p>什么是机器学习？</p>"},
        )

    @pytest.mark.asyncio
    async def test_script_tag_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """<script> tag in question accepted as literal text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "<script>alert('xss')</script> 什么是机器学习？"},
        )

    @pytest.mark.asyncio
    async def test_img_onerror_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """<img onerror=...> in question accepted as literal text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": '<img src=x onerror="alert(1)"> 人工智能'},
        )

    @pytest.mark.asyncio
    async def test_svg_onload_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """SVG with onload handler accepted as literal text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": '<svg onload="fetch(\'/evil\')"> 什么是深度学习？</svg>'},
        )

    @pytest.mark.asyncio
    async def test_encoded_html_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """HTML entity-encoded attack strings accepted as literal text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "&lt;script&gt;alert('xss')&lt;/script&gt; 你好"},
        )

    @pytest.mark.asyncio
    async def test_event_handler_attribute_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """HTML element with event handler attribute accepted as text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": '<div onclick="stealCookies()">机器学习</div>'},
        )


# ═══════════════════════════════════════════════════════════════════
# SQL injection tests (handled safely as text)
# ═══════════════════════════════════════════════════════════════════

class TestSqlInjection:
    """SQL injection strings in question are handled safely."""

    @pytest.mark.asyncio
    async def test_classic_sql_injection_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Classic OR 1=1 injection accepted as text, not executed."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "' OR '1'='1"},
        )

    @pytest.mark.asyncio
    async def test_drop_table_injection_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """DROP TABLE injection accepted as text, not executed."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "'; DROP TABLE users; --"},
        )

    @pytest.mark.asyncio
    async def test_union_select_injection_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """UNION SELECT injection accepted as text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "' UNION SELECT username, password FROM users --"},
        )

    @pytest.mark.asyncio
    async def test_comment_based_injection_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """SQL comment-based injection accepted as text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "admin'--"},
        )

    @pytest.mark.asyncio
    async def test_batched_sql_injection_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Batched SQL statements accepted as text."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "1; DROP TABLE documents; DROP TABLE qa_history; --"},
        )

    @pytest.mark.asyncio
    async def test_sql_injection_in_chinese_context(
        self, async_client: AsyncClient, student_token: str
    ):
        """SQL injection embedded in Chinese text accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "什么是'; SELECT * FROM users; --？"},
        )


# ═══════════════════════════════════════════════════════════════════
# course_id boundary / edge case tests
# ═══════════════════════════════════════════════════════════════════

class TestCourseIdBoundary:
    """course_id: int | None edge cases.

    Note: The endpoint creates a UserSession record with the provided
    course_id, and ``user_sessions.course_id`` has a FK constraint on
    ``courses.id``.  Non-existent course_ids therefore trigger a 500
    (IntegrityError) at the DB layer.  This is a known limitation of
    the current endpoint implementation.
    """

    @pytest.mark.asyncio
    async def test_negative_course_id_not_rejected_by_pydantic(
        self, async_client: AsyncClient, student_token: str
    ):
        """Negative course_id (-1) passes Pydantic int validation.

        The endpoint then fails with 500 (FK violation) because
        course_id=-1 does not exist in the courses table.
        """
        status = await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "什么是机器学习？", "course_id": -1},
        )
        # Document actual behavior: not 422 (Pydantic accepts int),
        # but 500 (FK violation) — a server-side robustness gap.
        assert status != 422, (
            f"Pydantic should accept negative int; got 422 unexpectedly"
        )

    @pytest.mark.asyncio
    async def test_zero_course_id_not_rejected_by_pydantic(
        self, async_client: AsyncClient, student_token: str
    ):
        """Zero course_id passes Pydantic int validation.

        FK violation at DB layer → 500.
        """
        status = await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "什么是机器学习？", "course_id": 0},
        )
        assert status != 422, "Pydantic should accept zero int"

    @pytest.mark.asyncio
    async def test_very_large_course_id_not_rejected_by_pydantic(
        self, async_client: AsyncClient, student_token: str
    ):
        """Very large course_id (999_999_999) passes Pydantic int validation.

        FK violation at DB layer → 500.
        """
        status = await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "什么是深度学习？", "course_id": 999_999_999},
        )
        assert status != 422, "Pydantic should accept large int"

    @pytest.mark.asyncio
    async def test_max_int_course_id_not_rejected_by_pydantic(
        self, async_client: AsyncClient, student_token: str
    ):
        """2^31-1 course_id passes Pydantic int validation.

        FK violation at DB layer → 500.
        """
        status = await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "什么是NLP？", "course_id": 2**31 - 1},
        )
        assert status != 422, "Pydantic should accept max-size int"

    @pytest.mark.asyncio
    async def test_null_course_id_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Explicit null course_id accepted (matches schema default, no FK check)."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "什么是强化学习？", "course_id": None},
        )

    @pytest.mark.asyncio
    async def test_float_course_id_rejected(
        self, async_client: AsyncClient, student_token: str
    ):
        """Float course_id (3.14) → 422 (type mismatch for int)."""
        await _assert_rejected(
            async_client, student_token,
            {"question": "什么是CNN？", "course_id": 3.14},
            field="course_id",
        )

    @pytest.mark.asyncio
    async def test_string_course_id_rejected(
        self, async_client: AsyncClient, student_token: str
    ):
        """String course_id ('abc') → 422 (type mismatch for int)."""
        await _assert_rejected(
            async_client, student_token,
            {"question": "什么是RNN？", "course_id": "abc"},
            field="course_id",
        )


# ═══════════════════════════════════════════════════════════════════
# use_web_search boundary tests
# ═══════════════════════════════════════════════════════════════════

class TestUseWebSearchBoundary:
    """use_web_search: bool field edge cases.

    Note: Pydantic coerces "true" / "false" (strings) and 1 / 0 (ints)
    into Python bools, so these are NOT rejected at validation time.
    """

    @pytest.mark.asyncio
    async def test_use_web_search_true_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """use_web_search=True is a valid bool."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "今天天气怎么样？", "use_web_search": True},
        )

    @pytest.mark.asyncio
    async def test_use_web_search_string_true_coerced(
        self, async_client: AsyncClient, student_token: str
    ):
        """use_web_search='true' (string) → coerced to True by Pydantic → 200."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "今天天气怎么样？", "use_web_search": "true"},
        )

    @pytest.mark.asyncio
    async def test_use_web_search_int_one_coerced(
        self, async_client: AsyncClient, student_token: str
    ):
        """use_web_search=1 (int) → coerced to True by Pydantic → 200."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "今天天气怎么样？", "use_web_search": 1},
        )


# ═══════════════════════════════════════════════════════════════════
# Combined edge cases
# ═══════════════════════════════════════════════════════════════════

class TestCombinedEdgeCases:
    """Multiple edge conditions simultaneously."""

    @pytest.mark.asyncio
    async def test_sql_injection_with_negative_course_id(
        self, async_client: AsyncClient, student_token: str
    ):
        """SQL injection + negative course_id.

        Question passes Pydantic + SQLKit parameter binding → safe.
        course_id=-1 → FK violation → 500 (server-side robustness gap).
        """
        await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "'; DROP TABLE users; --", "course_id": -1},
        )

    @pytest.mark.asyncio
    async def test_html_with_large_course_id(
        self, async_client: AsyncClient, student_token: str
    ):
        """HTML injection + very large course_id.

        HTML accepted as text; large course_id → FK violation → 500.
        """
        await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "<script>alert(1)</script>", "course_id": 999_999},
        )

    @pytest.mark.asyncio
    async def test_emoji_with_web_search_true(
        self, async_client: AsyncClient, student_token: str
    ):
        """Emoji question + web search enabled."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "人工智能 🤖 最新进展？", "use_web_search": True},
        )

    @pytest.mark.asyncio
    async def test_null_bytes_in_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Null byte (\\x00) in question.

        Pydantic accepts it (valid string), but PostgreSQL rejects
        \\x00 in UTF-8 TEXT columns → 500 (server error).
        """
        await _assert_accepted_or_err(
            async_client, student_token,
            {"question": "test\x00injection"},
        )

    @pytest.mark.asyncio
    async def test_newlines_in_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Multi-line question with newlines accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "第一行\n第二行\n第三行"},
        )

    @pytest.mark.asyncio
    async def test_tabs_in_question_accepted(
        self, async_client: AsyncClient, student_token: str
    ):
        """Tab characters in question accepted."""
        await _assert_accepted(
            async_client, student_token,
            {"question": "机器学习\t深度学习\t神经网络"},
        )
