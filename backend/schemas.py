from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ContentSubmit(BaseModel):
    title: str
    body: str
    author: Optional[str] = None
    source: Optional[str] = None


class ContentResponse(BaseModel):
    id: int
    title: str
    body: str
    author: Optional[str]
    status: str
    source: Optional[str]
    tags: List[str]
    created_at: datetime
    auto_review_result: Optional[str]
    auto_review_score: Optional[int]
    auto_review_reason: Optional[str]
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[str]
    review_note: Optional[str]

    class Config:
        from_attributes = True


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
