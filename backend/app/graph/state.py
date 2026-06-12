from typing import Annotated, TypedDict
import operator


class RAGState(TypedDict, total=False):
    chat_history: Annotated[list[dict], operator.add]  # 多轮累积
    question: str
    course_id: int | None
    use_web_search: bool
    intent: str                        # NORMAL | CHEATING | SENSITIVE | ATTACK
    internal_results: list[dict]
    document_titles: dict[int, str]    # 文档标题映射 {doc_id: title}
    has_internal_results: bool
    context: str
    sources: list[dict]
    search_mode: str                   # "internal" | "web"
    has_web_results: bool
    answer: str
    review_result: str                 # "PASS" | "REJECT"
    matched_sources: list[dict]
    is_rejected: bool
    rejection_reason: str
    rejection_category: str            # intent | no_results | web_failed | output_review
