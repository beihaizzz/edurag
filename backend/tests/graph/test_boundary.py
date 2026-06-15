"""Boundary tests for RAGState edge cases and routing logic verification.

Tests all 4 synchronous routing functions with explicit conditional branches,
empty state, missing keys, and unexpected/invalid values.
"""

import pytest

from app.graph.edges.routing import (
    route_after_classify,
    route_after_rerank,
    route_after_web_search,
    route_after_review,
)


# ═══════════════════════════════════════════════════════════════
# route_after_classify  tests
# ═══════════════════════════════════════════════════════════════

class TestRouteAfterClassify:
    """Intent-based routing from classify_intent node."""

    def test_empty_state_defaults_to_rag_search(self):
        """Empty/missing intent → returns 'rag_search' (default NORMAL)."""
        result = route_after_classify({})
        assert result == "rag_search"

    def test_missing_intent_defaults_to_rag_search(self):
        """State dict with other keys but no intent → returns 'rag_search'."""
        result = route_after_classify({"question": "什么是RAG？", "course_id": 1})
        assert result == "rag_search"

    def test_normal_intent_routes_to_rag_search(self):
        """NORMAL intent → 'rag_search'."""
        result = route_after_classify({"intent": "NORMAL"})
        assert result == "rag_search"

    def test_invalid_intent_routes_to_reject(self):
        """Unknown/invalid intent → 'reject'."""
        result = route_after_classify({"intent": "INVALID"})
        assert result == "reject"

    def test_cheating_intent_routes_to_reject(self):
        """CHEATING intent → 'reject'."""
        result = route_after_classify({"intent": "CHEATING"})
        assert result == "reject"

    def test_sensitive_intent_routes_to_reject(self):
        """SENSITIVE intent → 'reject'."""
        result = route_after_classify({"intent": "SENSITIVE"})
        assert result == "reject"

    def test_attack_intent_routes_to_reject(self):
        """ATTACK intent → 'reject'."""
        result = route_after_classify({"intent": "ATTACK"})
        assert result == "reject"


# ═══════════════════════════════════════════════════════════════
# route_after_rerank tests
# ═══════════════════════════════════════════════════════════════

class TestRouteAfterRerank:
    """Routing from rerank node: results, web fallback, or generate_answer."""

    # --- has_results → build_context (priority over web) ---

    def test_has_results_web_true_routes_to_build_context(self):
        """has_internal_results=True wins even when use_web_search=True."""
        result = route_after_rerank({
            "has_internal_results": True,
            "use_web_search": True,
        })
        assert result == "build_context"

    def test_has_results_web_false_routes_to_build_context(self):
        """has_internal_results=True → 'build_context' regardless of web flag."""
        result = route_after_rerank({
            "has_internal_results": True,
            "use_web_search": False,
        })
        assert result == "build_context"

    def test_has_results_only_routes_to_build_context(self):
        """Only has_internal_results set → 'build_context'."""
        result = route_after_rerank({"has_internal_results": True})
        assert result == "build_context"

    # --- no results → web_search (when web enabled) ---

    def test_no_results_web_true_routes_to_web_search(self):
        """No internal results + web enabled → 'web_search'."""
        result = route_after_rerank({
            "has_internal_results": False,
            "use_web_search": True,
        })
        assert result == "web_search"

    # --- no results, no web → generate_answer ---

    def test_no_results_web_false_routes_to_generate_answer(self):
        """No internal results + web disabled → 'generate_answer'."""
        result = route_after_rerank({
            "has_internal_results": False,
            "use_web_search": False,
        })
        assert result == "generate_answer"

    def test_empty_state_routes_to_generate_answer(self):
        """Empty state → generate_answer (all defaults falsy)."""
        result = route_after_rerank({})
        assert result == "generate_answer"

    def test_missing_keys_routes_to_generate_answer(self):
        """State with unrelated keys → generate_answer (defaults)."""
        result = route_after_rerank({"question": "anything"})
        assert result == "generate_answer"


# ═══════════════════════════════════════════════════════════════
# route_after_web_search  tests
# ═══════════════════════════════════════════════════════════════

class TestRouteAfterWebSearch:
    """Routing from web_search node: always → generate_answer."""

    def test_has_web_results_routes_to_generate_answer(self):
        """Web results found → 'generate_answer'."""
        result = route_after_web_search({"has_web_results": True})
        assert result == "generate_answer"

    def test_no_web_results_routes_to_generate_answer(self):
        """No web results → 'generate_answer'."""
        result = route_after_web_search({"has_web_results": False})
        assert result == "generate_answer"

    def test_empty_state_routes_to_generate_answer(self):
        """Empty state → generate_answer (default has_web_results=False)."""
        result = route_after_web_search({})
        assert result == "generate_answer"


# ═══════════════════════════════════════════════════════════════
# route_after_review  tests
# ═══════════════════════════════════════════════════════════════

class TestRouteAfterReview:
    """Routing from review_output node: PASS → return_answer, REJECT → reject."""

    def test_pass_review_routes_to_return_answer(self):
        """review_result=PASS → 'return_answer'."""
        result = route_after_review({"review_result": "PASS"})
        assert result == "return_answer"

    def test_reject_review_routes_to_reject(self):
        """review_result=REJECT → 'reject'."""
        result = route_after_review({"review_result": "REJECT"})
        assert result == "reject"

    def test_empty_state_defaults_to_return_answer(self):
        """Empty state → 'return_answer' (default review_result='PASS')."""
        result = route_after_review({})
        assert result == "return_answer"

    def test_unknown_review_result_routes_to_reject(self):
        """Unknown review_result → 'reject' (not PASS)."""
        result = route_after_review({"review_result": "UNKNOWN"})
        assert result == "reject"


# ═══════════════════════════════════════════════════════════════
# Cross-function edge cases
# ═══════════════════════════════════════════════════════════════

class TestRoutingEdgeCases:
    """Cross-cutting boundary tests across multiple routing functions."""

    def test_all_routers_handle_empty_state_gracefully(self):
        """All 4 routers accept empty dict without crashing."""
        assert isinstance(route_after_classify({}), str)
        assert isinstance(route_after_rerank({}), str)
        assert isinstance(route_after_web_search({}), str)
        assert isinstance(route_after_review({}), str)

    def test_all_routers_return_valid_node_names(self):
        """All routers return a string that is a known node name."""
        valid_nodes = {
            "rag_search", "reject", "build_context", "web_search",
            "generate_answer", "return_answer",
        }

        for fn in [
            route_after_classify,
            route_after_rerank,
            route_after_web_search,
            route_after_review,
        ]:
            assert fn({}) in valid_nodes, f"{fn.__name__}({{}}) returned unknown node"

    def test_route_after_rerank_has_results_overrides_web(self):
        """When has_internal_results=True, web flag is irrelevant."""
        result = route_after_rerank({
            "has_internal_results": True,
            "use_web_search": True,
        })
        assert result == "build_context"

    def test_full_rejection_path(self):
        """INTENT=INVALID → reject at classify stage."""
        result = route_after_classify({"intent": "INVALID"})
        assert result == "reject"

    def test_full_success_path(self):
        """NORMAL → rag_search → build_context → ... -> return_answer."""
        # classify
        r1 = route_after_classify({"intent": "NORMAL"})
        assert r1 == "rag_search"
        # rag_search with results
        r2 = route_after_rerank({"has_internal_results": True})
        assert r2 == "build_context"
        # review pass
        r3 = route_after_review({"review_result": "PASS"})
        assert r3 == "return_answer"
