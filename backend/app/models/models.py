"""
EduRAG 全部 ORM 模型（单文件，避免循环引用）
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ═══════════════════════════════════════════════════════════════════════
# User
# ═══════════════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, comment="学号(学生) / 工号(教师/admin)")
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="student", comment="student/teacher/admin")
    real_name: Mapped[str] = mapped_column(String(64), default="")
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    force_password_change: Mapped[bool] = mapped_column(Boolean, default=False, comment="管理员重置后强制修改密码")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    documents = relationship("Document", back_populates="uploader", foreign_keys="Document.uploader_id")
    qa_histories = relationship("QAHistory", back_populates="user")
    feedbacks = relationship("Feedback", back_populates="user")
    user_sessions = relationship("UserSession", back_populates="user", lazy="selectin")

    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"


# ═══════════════════════════════════════════════════════════════════════
# Course
# ═══════════════════════════════════════════════════════════════════════

class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    semester: Mapped[str] = mapped_column(String(32), nullable=False, comment="e.g. 2025-2026-2")
    teacher_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    teacher = relationship("User", foreign_keys=[teacher_id])
    documents = relationship("Document", back_populates="course")
    qa_histories = relationship("QAHistory", back_populates="course")
    user_sessions = relationship("UserSession", back_populates="course", lazy="selectin")

    def __repr__(self):
        return f"<Course(id={self.id}, name={self.name})>"


# ═══════════════════════════════════════════════════════════════════════
# Document
# ═══════════════════════════════════════════════════════════════════════

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    uploader_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(
        String(32), nullable=False,
        comment="courseware / lab_guide / assignment / reference / other",
    )
    title: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSONB, default=list, comment='["栈","队列"]')
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    file_hash: Mapped[str | None] = mapped_column(String(96), nullable=True, comment="SHA-256")
    status: Mapped[str] = mapped_column(
        String(20), default="pending", comment="pending / approved / rejected"
    )
    processing_status: Mapped[str] = mapped_column(
        String(20), default="pending", comment="pending / processing / completed / failed"
    )
    audit_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    auditor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="documents")
    uploader = relationship("User", back_populates="documents", foreign_keys=[uploader_id])
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document(id={self.id}, title={self.title})>"


# ═══════════════════════════════════════════════════════════════════════
# Chunk
# ═══════════════════════════════════════════════════════════════════════

class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    document = relationship("Document", back_populates="chunks")

    def __repr__(self):
        return f"<Chunk(id={self.id}, doc_id={self.document_id}, index={self.chunk_index})>"


# ═══════════════════════════════════════════════════════════════════════
# QAHistory
# ═══════════════════════════════════════════════════════════════════════

class QAHistory(Base):
    __tablename__ = "qa_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    course_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("courses.id"), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, comment="[{chunk_id, document_id, score}]"
    )
    is_rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="qa_histories")
    course = relationship("Course", back_populates="qa_histories")
    feedbacks = relationship("Feedback", back_populates="qa_history")

    def __repr__(self):
        return f"<QAHistory(id={self.id}, user_id={self.user_id})>"


# ═══════════════════════════════════════════════════════════════════════
# Feedback
# ═══════════════════════════════════════════════════════════════════════

class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (UniqueConstraint("qa_id", "user_id", name="uq_feedback_qa_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    qa_id: Mapped[int] = mapped_column(Integer, ForeignKey("qa_history.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, comment="useful / useless / error")
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    qa_history = relationship("QAHistory", back_populates="feedbacks")
    user = relationship("User", back_populates="feedbacks")

    def __repr__(self):
        return f"<Feedback(id={self.id}, qa_id={self.qa_id}, type={self.type})>"


# ═══════════════════════════════════════════════════════════════════════
# AuditLog
# ═══════════════════════════════════════════════════════════════════════

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ═══════════════════════════════════════════════════════════════════════
# RefreshToken
# ═══════════════════════════════════════════════════════════════════════

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
