from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="reviewer")
    display_name = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


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
    combined_score = Column(Float)
    ml_score = Column(Float)
    ml_confidence = Column(Float)
    ml_result = Column(String(50))
    ml_model_version = Column(String(100))
    ml_category_scores = Column(JSON)
    assigned_to = Column(String(100))
    assigned_at = Column(DateTime)
    assigned_by = Column(String(100))
    reviewed_at = Column(DateTime)
    reviewed_by = Column(String(100))
    review_note = Column(Text)

    reviews = relationship("ReviewLog", back_populates="content", cascade="all, delete-orphan")
    ml_reviews = relationship("MLReviewRecord", back_populates="content", cascade="all, delete-orphan")
    sample_reviews = relationship("SampleReview", back_populates="content", cascade="all, delete-orphan")


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


class MLThresholdConfig(Base):
    __tablename__ = "ml_threshold_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    pass_threshold = Column(Float, default=0.3)
    reject_threshold = Column(Float, default=0.7)
    ml_weight = Column(Float, default=0.5)
    rule_weight = Column(Float, default=0.5)
    enabled = Column(Boolean, default=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MLReviewRecord(Base):
    __tablename__ = "ml_review_records"

    id = Column(Integer, primary_key=True, index=True)
    content_id = Column(Integer, ForeignKey("contents.id"))
    model_version = Column(String(100))
    overall_score = Column(Float)
    confidence = Column(Float)
    is_safe = Column(Boolean)
    category_scores = Column(JSON)
    detected_topics = Column(JSON)
    processing_time_ms = Column(Integer)
    threshold_pass = Column(Float)
    threshold_reject = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    content = relationship("Content", back_populates="ml_reviews")


class SampleReview(Base):
    __tablename__ = "sample_reviews"

    id = Column(Integer, primary_key=True, index=True)
    content_id = Column(Integer, ForeignKey("contents.id"))
    sample_batch_id = Column(String(100), index=True)
    original_status = Column(String(50))
    original_reviewer = Column(String(100))
    sample_reason = Column(String(255))
    review_status = Column(String(50), default="pending")
    review_result = Column(String(50))
    reviewed_by = Column(String(100))
    review_note = Column(Text)
    is_consistent = Column(Boolean)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime)

    content = relationship("Content", back_populates="sample_reviews")


class SampleBatch(Base):
    __tablename__ = "sample_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(100), unique=True, index=True, nullable=False)
    sample_count = Column(Integer, default=0)
    sample_rate = Column(Float, default=0.1)
    status = Column(String(50), default="active")
    reviewed_count = Column(Integer, default=0)
    consistent_count = Column(Integer, default=0)
    inconsistent_count = Column(Integer, default=0)
    consistency_rate = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
