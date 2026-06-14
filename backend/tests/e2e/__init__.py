"""E2E integration tests — complete user journey flows.

Tests:
    TestDocumentToQaE2E    — Upload → process → approve → search → QA → verify answer cites document
    TestMultiTurnE2E       — 3-turn conversation, verify context persistence via sessions
    TestCrossModuleE2E     — search → QA → feedback → history data consistency
    TestDegradationE2E     — Degradation: no results + web=off → reject; web=on → fallback or reject

All tests require ``DEEPSEEK_API_KEY`` and use ``async_client`` with the
transactional test database.  Marked with ``@pytest.mark.e2e`` so they can
be selected with ``pytest -m e2e``.
"""
