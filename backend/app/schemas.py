from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models import ActionType, SLAEventType, SLAStatus, TicketPriority, TicketStatus, UserRole


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=120)
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: UserRole
    is_senior_agent: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TicketCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    priority: TicketPriority = TicketPriority.medium
    category: str = "general"


class TicketOut(BaseModel):
    id: int
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    category: str
    user_id: int
    agent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    user: Optional[UserOut] = None
    agent: Optional[UserOut] = None

    model_config = {"from_attributes": True}


class TicketDetailOut(TicketOut):
    messages: list["MessageOut"] = []
    actions: list["ActionOut"] = []
    rating: Optional["RatingOut"] = None

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    is_internal: bool = False


class MessageOut(BaseModel):
    id: int
    ticket_id: int
    sender_id: int
    content: str
    is_internal: bool
    created_at: datetime
    sender: Optional[UserOut] = None

    model_config = {"from_attributes": True}


class ActionCreate(BaseModel):
    action_type: ActionType
    to_user_id: Optional[int] = None
    reason: Optional[str] = None
    priority: Optional[TicketPriority] = None


class ActionOut(BaseModel):
    id: int
    ticket_id: int
    action_type: ActionType
    from_user_id: Optional[int] = None
    to_user_id: Optional[int] = None
    reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class RatingOut(BaseModel):
    id: int
    ticket_id: int
    user_id: int
    score: int
    comment: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class KnowledgeBaseOut(BaseModel):
    id: int
    title: str
    content: str
    category: str
    tags: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecommendedKBOut(BaseModel):
    id: int
    title: str
    content: str
    category: str
    tags: Optional[str] = None
    score: float


class RecommendedTicketOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    status: TicketStatus
    score: float


class RecommendationRequest(BaseModel):
    query: str = Field(..., min_length=1)
    category: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=20)


class RecommendationResponse(BaseModel):
    knowledge_articles: list[RecommendedKBOut] = []
    similar_tickets: list[RecommendedTicketOut] = []


class SLARuleCreate(BaseModel):
    category: str = Field(..., max_length=50)
    priority: TicketPriority
    response_time_minutes: int = Field(..., ge=1)
    resolution_time_minutes: int = Field(..., ge=1)
    warning_threshold: float = Field(0.75, ge=0.1, le=0.99)
    auto_escalate: bool = False


class SLARuleUpdate(BaseModel):
    response_time_minutes: Optional[int] = Field(None, ge=1)
    resolution_time_minutes: Optional[int] = Field(None, ge=1)
    warning_threshold: Optional[float] = Field(None, ge=0.1, le=0.99)
    auto_escalate: Optional[bool] = None
    is_active: Optional[bool] = None


class SLARuleOut(BaseModel):
    id: int
    category: str
    priority: TicketPriority
    response_time_minutes: int
    resolution_time_minutes: int
    warning_threshold: float
    auto_escalate: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SLAStatusOut(BaseModel):
    sla_status: SLAStatus
    response_deadline: Optional[datetime] = None
    resolution_deadline: Optional[datetime] = None
    response_remaining_minutes: Optional[float] = None
    resolution_remaining_minutes: Optional[float] = None
    response_breached: bool = False
    resolution_breached: bool = False
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


class TicketWithSLAOut(TicketOut):
    sla: Optional[SLAStatusOut] = None

    model_config = {"from_attributes": True}


class TicketDetailWithSLAOut(TicketDetailOut):
    sla: Optional[SLAStatusOut] = None

    model_config = {"from_attributes": True}


class SLAEventOut(BaseModel):
    id: int
    event_type: SLAEventType
    message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketSLADetailOut(SLAStatusOut):
    id: int
    sla_rule: Optional[SLARuleOut] = None
    events: list[SLAEventOut] = []

    model_config = {"from_attributes": True}
