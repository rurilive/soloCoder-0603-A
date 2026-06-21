from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..core.database import Base


class TranslationTask(Base):
    __tablename__ = "translation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("content_entries.id", ondelete="CASCADE"), nullable=False)
    source_language = Column(String(10), nullable=False)
    target_language = Column(String(10), nullable=False)
    status = Column(String(20), default="pending", index=True)
    priority = Column(String(20), default="normal")
    progress = Column(Integer, default=0)
    deadline = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    source_field_values = Column(JSON, default={})
    translated_field_values = Column(JSON, default={})

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    entry = relationship("ContentEntry")
    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="created_tasks")
    assignee = relationship("User", foreign_keys=[assignee_id], back_populates="assigned_tasks")
    reviews = relationship("TranslationReview", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("TranslationComment", back_populates="task", cascade="all, delete-orphan")
    history = relationship("TranslationTaskHistory", back_populates="task", cascade="all, delete-orphan")


class TranslationTaskHistory(Base):
    __tablename__ = "translation_task_history"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("translation_tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)
    old_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=True)
    comment = Column(Text, nullable=True)
    changes = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("TranslationTask", back_populates="history")
    user = relationship("User")


class TranslationReview(Base):
    __tablename__ = "translation_reviews"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("translation_tasks.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")
    comment = Column(Text, nullable=True)
    reviewed_field_values = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("TranslationTask", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews")


class TranslationComment(Base):
    __tablename__ = "translation_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("translation_tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    field_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("TranslationTask", back_populates="comments")
    user = relationship("User")
