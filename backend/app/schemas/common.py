"""通用响应模型"""

from typing import Any

from pydantic import BaseModel


class APIResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = 0
    message: str = "success"
    data: Any = None

    model_config = {"from_attributes": True}


class PaginatedData(BaseModel):
    """分页数据结构"""
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int
