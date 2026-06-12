"""SSE streaming format and event tests"""

import json
import pytest
from unittest.mock import AsyncMock, patch


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


class TestSSEFormat:
    def test_sse_event_format_valid(self):
        """Valid SSE text should parse correctly"""
        text = 'event: classify\ndata: {"intent": "NORMAL"}\n\nevent: done\ndata: {"answer": "OK"}\n\n'
        events = parse_sse_events(text)
        assert len(events) == 2
        assert events[0]["event"] == "classify"
        assert events[0]["data"]["intent"] == "NORMAL"

    def test_sse_reject_event_format(self):
        """Reject event should have correct format"""
        text = 'event: reject\ndata: {"reason": "no_results", "is_rejected": true}\n\n'
        events = parse_sse_events(text)
        assert events[0]["event"] == "reject"
        assert events[0]["data"]["is_rejected"] is True

    def test_sse_done_event_has_required_fields(self):
        """Done event should contain answer, sources, thread_id"""
        text = 'event: done\ndata: {"answer": "test", "sources": [], "is_rejected": false, "thread_id": "abc-123"}\n\n'
        events = parse_sse_events(text)
        data = events[0]["data"]
        assert "answer" in data
        assert "sources" in data
        assert "thread_id" in data

    def test_sse_error_event(self):
        """Error event should be parseable"""
        text = 'event: error\ndata: {"error": "internal_error"}\n\n'
        events = parse_sse_events(text)
        assert events[0]["event"] == "error"


class TestSSEEventTypes:
    """Verify that the SSE endpoint produces expected event types"""

    @pytest.mark.asyncio
    async def test_normal_flow_events(self):
        """Full normal flow should produce classify→retrieve→generate→review→done"""
        from langgraph.checkpoint.memory import InMemorySaver
        from app.graph.state import RAGState

        # ── Real in-memory checkpointer (no DB needed) ─────────────
        checkpointer = InMemorySaver()

        # ── Mock classify_intent LLM → NORMAL ──────────────────────
        mock_cls_llm = AsyncMock(return_value="NORMAL")

        # ── Mock rag_search → results ──────────────────────────────
        mock_search_results = [
            {"chunk_id": 1, "document_id": 1, "content": "内容", "score": 0.85}
        ]

        # ── Mock build_context DB → empty titles (uses fallback) ───
        mock_db_session = AsyncMock()
        mock_db_session.execute = AsyncMock(return_value=[])
        mock_db_ctx = AsyncMock()
        mock_db_ctx.__aenter__ = AsyncMock(return_value=mock_db_session)
        mock_db_ctx.__aexit__ = AsyncMock(return_value=None)

        # ── Mock generate_answer LLM ───────────────────────────────
        mock_gen_llm = AsyncMock(return_value="答案 [来源1]")

        with patch(
            "app.graph.builder.get_checkpointer",
            AsyncMock(return_value=checkpointer),
        ), patch(
            "app.graph.nodes.classify_intent.invoke_llm",
            mock_cls_llm,
        ), patch(
            "app.graph.nodes.rag_search.vector_store",
        ) as mock_vs:
            mock_vs.search = AsyncMock(return_value=mock_search_results)

            with patch(
                "app.graph.nodes.rag_search.AsyncSessionLocal",
                return_value=mock_db_ctx,
            ), patch(
                "app.graph.nodes.generate_answer.invoke_llm",
                mock_gen_llm,
            ), patch(
                "app.graph.nodes.review_output.invoke_llm",
                new_callable=AsyncMock,
                return_value="PASS",
            ):
                from app.graph.builder import build_rag_graph

                graph = await build_rag_graph()

                events_seen = set()
                async for event in graph.astream(
                    {"question": "测试", "use_web_search": False},
                    {"configurable": {"thread_id": "sse-test-1"}},
                    stream_mode="updates",
                ):
                    for node_name, _ in event.items():
                        events_seen.add(node_name)

                assert "classify_intent" in events_seen
                assert "rag_search" in events_seen
                assert "generate_answer" in events_seen
                assert "review_output" in events_seen
                assert "return_answer" in events_seen
