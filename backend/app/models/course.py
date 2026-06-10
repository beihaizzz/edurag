"""课程模型"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    semester: Mapped[str] = mapped_column(String(32), nullable=False, comment="e.g. 2025-2026-2")
    teacher_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # 关系
    teacher = relationship("User", foreign_keys=[teacher_id])
    documents = relationship("Document", back_populates="course")
    qa_histories = relationship("QAHistory", back_populates="course")

    def __repr__(self):
        return f"<Course(id={self.id}, name={self.name})>"
