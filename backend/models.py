from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Content(Base):
    __tablename__ = "contents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    image_url = Column(String(500))
    image_review_result = Column(String(50))
    image_review_confidence = Column(Integer)
    author = Column(String(100))
    status = Column(String(50), default="pending")
    source = Column(String(100))
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    auto_review_result = Column(String(50))
    auto_review_score = Column(Integer)
    auto_review_reason = Column(Text)
    reviewed_at = Column(DateTime)
    reviewed_by = Column(String(100))
    review_note = Column(Text)

    reviews = relationship("ReviewLog", back_populates="content", cascade="all, delete-orphan")


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    content_id = Column(Integer, ForeignKey("contents.id"))
    action = Column(String(50), nullable=False)
    reviewer = Column(String(100))
    note = Column(Text)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    content = relationship("Content", back_populates="reviews")


class AutoReviewRule(Base):
    __tablename__ = "auto_review_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    rule_type = Column(String(50), nullable=False)
    pattern = Column(String(500), nullable=False)
    action = Column(String(50), nullable=False)
    score = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
