"""文档管理模块 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class DocumentUpload(BaseModel):
    """文档上传请求（由 Form 解析，此为元数据部分）"""
    title: str = Field(min_length=1, max_length=512)
    file_type: str = Field(
        default="other",
        pattern=r"^(courseware|lab_guide|assignment|reference|other)$",
    )
    course_id: int | None = None
    description: str = ""
    tags: list[str] = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    """更新文档"""
    title: str | None = Field(None, min_length=1, max_length=512)
    file_type: str | None = Field(
        None, pattern=r"^(courseware|lab_guide|assignment|reference|other)$"
    )
    course_id: int | None = None
    description: str | None = None
    tags: list[str] | None = None


class CourseBrief(BaseModel):
    """课程简要信息"""
    id: int
    name: str
    semester: str | None = None

    model_config = {"from_attributes": True}


class UploaderBrief(BaseModel):
    """上传者简要信息"""
    id: int
    real_name: str

    model_config = {"from_attributes": True}


class DocumentItem(BaseModel):
    """文档列表项"""
    id: int
    title: str
    file_type: str
    filename: str
    file_size: int
    tags: list = Field(default_factory=list)
    status: str
    processing_status: str
    chunk_count: int = 0
    course: CourseBrief | None = None
    uploader: UploaderBrief | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChunkPreview(BaseModel):
    """Chunk 预览"""
    chunk_index: int
    content: str
    char_count: int

    model_config = {"from_attributes": True}


class DocumentDetail(BaseModel):
    """文档详情"""
    id: int
    title: str
    file_type: str
    filename: str
    file_size: int
    file_hash: str | None = None
    tags: list = Field(default_factory=list)
    description: str
    status: str
    processing_status: str
    audit_comment: str | None = None
    chunk_count: int = 0
    course: CourseBrief | None = None
    uploader: UploaderBrief | None = None
    chunks_preview: list[ChunkPreview] = Field(default_factory=list)
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class DocumentApprove(BaseModel):
    """文档审核"""
    status: str = Field(pattern=r"^(approved|rejected)$")
    comment: str = ""
