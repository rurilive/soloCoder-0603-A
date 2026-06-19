from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    department: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(UserBase):
    id: int
    role: str
    is_senior_agent: bool = False
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TicketBase(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    category: str = "general"


class TicketCreate(TicketBase):
    pass


class TicketOut(TicketBase):
    id: int
    status: str
    user_id: int
    agent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TicketWithSLAOut(TicketOut):
    sla: Optional[dict] = None


class TicketDetailWithSLAOut(TicketWithSLAOut):
    messages: Optional[list] = None
    actions: Optional[list] = None
    rating: Optional[dict] = None


class MessageBase(BaseModel):
    content: str
    is_internal: bool = False


class MessageCreate(MessageBase):
    pass


class MessageOut(MessageBase):
    id: int
    ticket_id: int
    sender_id: int
    sender: Optional[UserOut] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActionBase(BaseModel):
    to_user_id: Optional[int] = None
    priority: Optional[str] = None
    reason: Optional[str] = None


class ActionCreate(ActionBase):
    pass


class ActionOut(ActionBase):
    id: int
    ticket_id: int
    action_type: str
    from_user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RatingBase(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class RatingCreate(RatingBase):
    pass


class RatingOut(RatingBase):
    id: int
    ticket_id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SLARuleBase(BaseModel):
    category: str
    priority: str
    response_time_minutes: int = 60
    resolution_time_minutes: int = 1440
    warning_threshold: float = 0.75
    auto_escalate: bool = False


class SLARuleCreate(SLARuleBase):
    pass


class SLARuleOut(SLARuleBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SLAStatusOut(BaseModel):
    sla_status: str
    response_deadline: Optional[datetime] = None
    resolution_deadline: Optional[datetime] = None
    response_remaining_minutes: Optional[float] = None
    resolution_remaining_minutes: Optional[float] = None
    response_breached: bool = False
    resolution_breached: bool = False
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


class TicketSLADetailOut(BaseModel):
    id: int
    ticket_id: int
    rule: Optional[SLARuleOut] = None
    sla_status: SLAStatusOut
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PersonalStats(BaseModel):
    agent_id: int
    agent_name: str
    period: str
    ticket_count: int = 0
    avg_response_time: float = 0.0
    resolution_rate: float = 0.0
    sla_compliance_rate: float = 0.0
    avg_satisfaction: Optional[float] = None
    resolved_count: int = 0


class TrendPoint(BaseModel):
    date: str
    ticket_count: int
    avg_response_time: float
    resolution_rate: float
    sla_compliance_rate: float


class PersonalTrendResponse(BaseModel):
    agent_id: int
    period: str
    data: list[TrendPoint]


class AgentRankingItem(BaseModel):
    agent_id: int
    agent_name: str
    avatar: Optional[str] = None
    department: Optional[str] = None
    ticket_count: int
    avg_response_time: float
    resolution_rate: float
    sla_compliance_rate: float
    rank: int


class TeamOverview(BaseModel):
    period: str
    department: str = "all"
    total_tickets: int = 0
    avg_response_time: float = 0.0
    resolution_rate: float = 0.0
    sla_compliance_rate: float = 0.0
    agent_count: int = 0


class TeamTrendResponse(BaseModel):
    period: str
    department: str
    data: list[TrendPoint]


class TeamRankingResponse(BaseModel):
    period: str
    department: str
    ranking: list[AgentRankingItem]
