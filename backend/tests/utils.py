"""Reusable test utility functions for EduRAG backend tests.

Functions:
    parse_sse_events      — Parse SSE text into list of {event, data} dicts
    assert_sse_event      — Assert events contains an event of given type with matching fields
    generate_test_content — Generate Chinese academic text of specified length
    wait_for_processing   — Poll document status until processing completes or timeout
    assert_api_response   — Assert API response status + body code, return parsed JSON data
"""

import json
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document


# ═══════════════════════════════════════════════════════════════════════
# SSE parsing & assertion
# ═══════════════════════════════════════════════════════════════════════


def parse_sse_events(text: str) -> list[dict]:
    """Parse SSE text into list of {event, data} dicts."""
    events = []
    current_event = None
    for line in text.strip().split("\n"):
        if line.startswith("event: "):
            current_event = line[7:]
        elif line.startswith("data: "):
            data_str = line[6:]
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                data = {"raw": data_str}
            events.append({"event": current_event or "unknown", "data": data})
    return events


def assert_sse_event(events: list[dict], event_type: str, **fields: Any) -> dict:
    """Assert that *events* contains an event of *event_type* with matching **fields in data.

    Returns the matched event dict.  Raises AssertionError if no matching event is found.
    """
    for ev in events:
        if ev["event"] == event_type:
            for key, val in fields.items():
                actual = ev["data"].get(key)
                assert actual == val, (
                    f"SSE event {event_type!r}: expected {key}={val!r}, "
                    f"got {actual!r}"
                )
            return ev
    raise AssertionError(
        f"SSE event {event_type!r} not found in [{', '.join(e['event'] for e in events)}]"
    )


# ═══════════════════════════════════════════════════════════════════════
# Content generation
# ═══════════════════════════════════════════════════════════════════════


def generate_test_content(num_chars: int = 500) -> str:
    """Generate Chinese academic text of roughly *num_chars* characters."""
    sentence = "机器学习是人工智能的重要分支，它通过算法让计算机从数据中学习规律和模式。"
    repeats = (num_chars // len(sentence)) + 1
    return (sentence * repeats)[:num_chars]


# ═══════════════════════════════════════════════════════════════════════
# Polling helpers
# ═══════════════════════════════════════════════════════════════════════


async def wait_for_processing(
    document_id: int,
    test_db: AsyncSession,
    timeout: int = 60,
    interval: int = 2,
) -> dict:
    """Poll *document_id* processing_status until completion or *timeout*.

    Returns the Document row dict (via ``._asdict()`` or attribute access).
    Raises TimeoutError if the status does not reach a terminal state in time.
    """
    terminal_states = {"completed", "failed"}
    deadline = time.monotonic() + timeout

    while True:
        result = await test_db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()

        if doc is None:
            raise AssertionError(f"Document id={document_id} not found")

        if doc.processing_status in terminal_states:
            return {
                "id": doc.id,
                "status": doc.status,
                "processing_status": doc.processing_status,
                "filename": doc.filename,
            }

        if time.monotonic() >= deadline:
            raise TimeoutError(
                f"Document id={document_id} still {doc.processing_status!r} "
                f"after {timeout}s (expected {terminal_states})"
            )

        await test_db.close()  # ensure no stale connection hitch
        await _async_sleep(interval)


async def _async_sleep(seconds: float) -> None:
    """Small async sleep helper — avoids importing asyncio at module level."""
    import asyncio

    await asyncio.sleep(seconds)


# ═══════════════════════════════════════════════════════════════════════
# API response assertion
# ═══════════════════════════════════════════════════════════════════════


def assert_api_response(
    response: Any,
    expected_status: int = 200,
    expected_code: int = 0,
) -> dict | None:
    """Assert HTTP *expected_status* and response body *expected_code*.

    Returns the parsed ``data`` field from the JSON body (or None).
    """
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: "
        f"{response.text[:200]}"
    )
    body = response.json()
    if expected_code is not None:
        assert body.get("code") == expected_code, (
            f"Expected code {expected_code}, got {body.get('code')}: "
            f"{body.get('message', '')}"
        )
    return body.get("data")
