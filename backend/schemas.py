from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ContentSubmit(BaseModel):
    title: str
    body: str
    image_url: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None


class ContentResponse(BaseModel):
    id: int
    title: str
    body: str
    image_url: Optional[str]
    image_review_result: Optional[str]
    image_review_confidence: Optional[int]
    author: Optional[str]
    status: str
    source: Optional[str]
    tags: List[str]
    created_at: datetime
    auto_review_result: Optional[str]
    auto_review_score: Optional[int]
    auto_review_reason: Optional[str]
    ml_score: Optional[float]
    ml_confidence: Optional[float]
    ml_result: Optional[str]
    ml_model_version: Optional[str]
    ml_category_scores: Optional[List[dict]]
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[str]
    review_note: Optional[str]

    class Config:
        from_attributes = True


class ImageReviewResult(BaseModel):
    result: str
    confidence: int
    reason: str


class ReviewAction(BaseModel):
    action: str
    note: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    reviewer: Optional[str] = "system"


class ReviewLogResponse(BaseModel):
    id: int
    content_id: int
    action: str
    reviewer: Optional[str]
    note: Optional[str]
    tags: List[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AutoReviewRuleCreate(BaseModel):
    name: str
    rule_type: str
    pattern: str
    action: str
    score: int = 0
    enabled: bool = True
    description: Optional[str] = None


class AutoReviewRuleResponse(BaseModel):
    id: int
    name: str
    rule_type: str
    pattern: str
    action: str
    score: int
    enabled: bool
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AutoReviewResult(BaseModel):
    result: str
    score: int
    reason: str
    matched_rules: List[int]


class CategoryScore(BaseModel):
    category: str
    score: float


class MLReviewResult(BaseModel):
    model_version: str
    overall_score: float
    is_safe: bool
    confidence: float
    category_scores: List[CategoryScore]
    detected_topics: List[str]
    processing_time_ms: int


class MLThresholdConfigCreate(BaseModel):
    name: str
    pass_threshold: float = Field(ge=0, le=1, default=0.3)
    reject_threshold: float = Field(ge=0, le=1, default=0.7)
    ml_weight: float = Field(ge=0, le=1, default=0.5)
    rule_weight: float = Field(ge=0, le=1, default=0.5)
    enabled: bool = True
    description: Optional[str] = None


class MLThresholdConfigUpdate(BaseModel):
    pass_threshold: Optional[float] = Field(ge=0, le=1, default=None)
    reject_threshold: Optional[float] = Field(ge=0, le=1, default=None)
    ml_weight: Optional[float] = Field(ge=0, le=1, default=None)
    rule_weight: Optional[float] = Field(ge=0, le=1, default=None)
    enabled: Optional[bool] = None
    description: Optional[str] = None


class MLThresholdConfigResponse(BaseModel):
    id: int
    name: str
    pass_threshold: float
    reject_threshold: float
    ml_weight: float
    rule_weight: float
    enabled: bool
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MLReviewRecordResponse(BaseModel):
    id: int
    content_id: int
    model_version: Optional[str]
    overall_score: Optional[float]
    confidence: Optional[float]
    is_safe: Optional[bool]
    category_scores: Optional[List[dict]]
    detected_topics: Optional[List[str]]
    processing_time_ms: Optional[int]
    threshold_pass: Optional[float]
    threshold_reject: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True


class SampleReviewAction(BaseModel):
    result: str
    note: Optional[str] = None
    reviewer: Optional[str] = "system"


class SampleReviewResponse(BaseModel):
    id: int
    content_id: int
    sample_batch_id: Optional[str]
    original_status: Optional[str]
    original_reviewer: Optional[str]
    sample_reason: Optional[str]
    review_status: str
    review_result: Optional[str]
    reviewed_by: Optional[str]
    review_note: Optional[str]
    is_consistent: Optional[bool]
    created_at: datetime
    reviewed_at: Optional[datetime]
    content: Optional[ContentResponse] = None

    class Config:
        from_attributes = True


class SampleBatchResponse(BaseModel):
    id: int
    batch_id: str
    sample_count: int
    sample_rate: float
    status: str
    reviewed_count: int
    consistent_count: int
    inconsistent_count: int
    consistency_rate: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class SampleRequest(BaseModel):
    sample_rate: float = Field(ge=0.01, le=1.0, default=0.1)
    batch_id: Optional[str] = None
    max_samples: Optional[int] = Field(ge=1, default=None)
