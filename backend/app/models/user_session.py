"""User session model for LangGraph conversation tracking"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(
        String(36), unique=True, nullable=False, index=True, comment="LangGraph checkpointer thread_id"
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id"), nullable=True
    )
    first_question: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Session first question for list display"
    )
    turn_count: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # relationships
    user = relationship("User", back_populates="user_sessions")
    course = relationship("Course", back_populates="user_sessions")

    def __repr__(self):
        return f"<UserSession(id={self.id}, thread_id={self.thread_id}, user_id={self.user_id})>"
