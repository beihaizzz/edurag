"""通用响应模型"""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """统一 API 响应格式"""
    code: int = 0
    message: str = "success"
    data: T | None = None

    model_config = {"from_attributes": True}


class PaginatedData(BaseModel):
    """分页数据结构"""
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
