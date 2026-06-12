"""检索 + 问答模块 Pydantic 模型"""

from pydantic import BaseModel, Field


class SearchParams(BaseModel):
    """检索参数"""
    q: str
    mode: str = "keyword"
    course_id: int | None = None
    page: int = 1
    page_size: int = 10


class MatchedSnippet(BaseModel):
    """匹配片段"""
    chunk_id: int
    content: str
    score: float


class SearchResultItem(BaseModel):
    """单条检索结果"""
    document_id: int
    title: str
    file_type: str
    course_name: str
    matched_snippets: list[MatchedSnippet]


class SearchResponse(BaseModel):
    """检索响应"""
    results: list[SearchResultItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    mode: str
    query: str


class QaCreate(BaseModel):
    """问答请求"""
    question: str = Field(min_length=1, max_length=2000)
    course_id: int | None = None
    use_web_search: bool = False


class QaSource(BaseModel):
    """问答引用来源"""
    chunk_id: int
    document_id: int
    title: str
    score: float


class QaItem(BaseModel):
    """问答历史项"""
    id: int
    question: str
    answer: str
    sources: list[QaSource] | None = None
    is_rejected: bool = False
    latency_ms: int | None = None
    course_id: int | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}


class QaResponse(BaseModel):
    """问答响应"""
    id: int
    question: str
    answer: str
    sources: list[QaSource] | None = None
    is_rejected: bool = False
    latency_ms: int | None = None
