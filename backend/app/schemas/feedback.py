"""反馈模块 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field, field_serializer


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
    comment: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime | None) -> str | None:
        return v.isoformat() if v else None
