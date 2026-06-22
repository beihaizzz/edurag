"""RAG graph builder — assemble StateGraph with 9 nodes + 4 conditional edges"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from app.graph.checkpointer import get_checkpointer
from app.graph.edges.routing import (
    route_after_classify,
    route_after_rerank,
    route_after_review,
)
from app.graph.nodes.build_context import build_context
from app.graph.nodes.classify_intent import classify_intent
from app.graph.nodes.generate_answer import generate_answer
from app.graph.nodes.rag_search import rag_search
from app.graph.nodes.rerank import rerank
from app.graph.nodes.reject import reject
from app.graph.nodes.return_answer import return_answer
from app.graph.nodes.review_output import review_output
from app.graph.nodes.rewrite_query import rewrite_query
from app.graph.nodes.web_search import web_search
from app.graph.state import RAGState

logger = logging.getLogger(__name__)


async def build_rag_graph() -> StateGraph:
    """Build and compile the RAG StateGraph with 10 nodes and 4 conditional edges.
    
    Graph topology:
    START → classify_intent → [NORMAL→rewrite_query | other→reject]
    rewrite_query → rag_search
    rag_search → rerank
    rerank → [has_results→build_context | web_on→web_search | web_off→generate_answer]
    build_context → generate_answer
    web_search → generate_answer
    generate_answer → review_output → [PASS→return_answer | REJECT→reject]
    reject → END
    return_answer → END
    """
    builder = StateGraph(RAGState)

    # Register all 10 nodes
    builder.add_node("classify_intent", classify_intent)
    builder.add_node("rewrite_query", rewrite_query)
    builder.add_node("rag_search", rag_search)
    builder.add_node("rerank", rerank)
    builder.add_node("build_context", build_context)
    builder.add_node("web_search", web_search)
    builder.add_node("generate_answer", generate_answer)
    builder.add_node("review_output", review_output)
    builder.add_node("reject", reject)
    builder.add_node("return_answer", return_answer)

    # Wire edges
    builder.add_edge(START, "classify_intent")

    builder.add_conditional_edges(
        "classify_intent",
        route_after_classify,
        {"rewrite_query": "rewrite_query", "reject": "reject"},
    )

    # rewrite_query → rag_search (straight edge)
    builder.add_edge("rewrite_query", "rag_search")

    # rag_search → rerank (straight edge)
    builder.add_edge("rag_search", "rerank")

    # rerank → conditional
    builder.add_conditional_edges(
        "rerank",
        route_after_rerank,
        {
            "build_context": "build_context",
            "web_search": "web_search",
            "generate_answer": "generate_answer",
        },
    )

    builder.add_edge("build_context", "generate_answer")

    # web_search → generate_answer (always — no-context/fallback handled by LLM)
    builder.add_edge("web_search", "generate_answer")

    builder.add_edge("generate_answer", "review_output")

    builder.add_conditional_edges(
        "review_output",
        route_after_review,
        {"return_answer": "return_answer", "reject": "reject"},
    )

    builder.add_edge("reject", END)
    builder.add_edge("return_answer", END)

    # Compile with checkpointer
    checkpointer = await get_checkpointer()
    graph = builder.compile(checkpointer=checkpointer)
    logger.info("RAG graph compiled with AsyncPostgresSaver")
    return graph
