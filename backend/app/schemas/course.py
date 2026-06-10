"""课程管理模块 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    """创建课程"""
    name: str = Field(min_length=1, max_length=256)
    semester: str = Field(min_length=1, max_length=32)
    description: str = ""


class CourseUpdate(BaseModel):
    """更新课程"""
    name: str | None = Field(None, min_length=1, max_length=256)
    semester: str | None = Field(None, min_length=1, max_length=32)
    description: str | None = None


class TeacherBrief(BaseModel):
    """教师简要信息"""
    id: int
    real_name: str

    model_config = {"from_attributes": True}


class CourseItem(BaseModel):
    """课程列表项"""
    id: int
    name: str
    semester: str
    teacher: TeacherBrief | None = None
    document_count: int = 0
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CourseDetail(BaseModel):
    """课程详情"""
    id: int
    name: str
    semester: str
    description: str
    teacher: TeacherBrief | None = None
    document_count: int = 0
    is_deleted: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
