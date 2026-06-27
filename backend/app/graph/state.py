from typing import Annotated, TypedDict
import operator


class RAGState(TypedDict, total=False):
    chat_history: Annotated[list[dict], operator.add]  # 多轮累积
    question: str
    rewritten_question: str          # 改写后的独立搜索 query（由 rewrite_query 节点生成）
    query_was_rewritten: bool        # rewrite_query 是否真的调用了 LLM 改写（vs passthrough）
    course_id: int | None
    use_web_search: bool
    intent: str                        # NORMAL | CHITCHAT | CHEATING | SENSITIVE | ATTACK
    sub_intent: str                    # CONCEPT | PROCEDURE | REASONING | COMPARISON | EXAMPLE | FOLLOWUP (only for NORMAL)
    internal_results: list[dict]
    document_titles: dict[int, str]    # 文档标题映射 {doc_id: title}
    has_internal_results: bool
    reranked: bool                       # whether cross-encoder reranker was applied
    input_count: int                     # number of chunks before reranking
    output_count: int                    # number of chunks after reranking
    context: str
    sources: list[dict]
    search_mode: str                   # "internal" | "web"
    has_web_results: bool
    answer: str
    used_fallback: bool                # generate_answer used FALLBACK prompt (AI knowledge only) instead of grounded MAIN prompt
    review_result: str                 # "PASS" | "REJECT"
    matched_sources: list[dict]
    is_rejected: bool
    rejection_reason: str
    rejection_category: str            # intent | no_results | web_failed | output_review
