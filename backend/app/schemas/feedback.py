"""反馈模块 Pydantic 模型"""

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    """创建反馈"""
    qa_id: int
    type: str = Field(pattern=r"^(useful|useless|error)$")
    comment: str = ""


class FeedbackItem(BaseModel):
    """反馈历史项"""
    id: int
    qa_id: int
    type: str
    comment: str
    created_at: str | None = None

    model_config = {"from_attributes": True}
