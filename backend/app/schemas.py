from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List


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
    data: List[TrendPoint]


class AgentRankingItem(BaseModel):
    agent_id: int
    agent_name: str
    avatar: Optional[str] = None
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
    data: List[TrendPoint]


class TeamRankingResponse(BaseModel):
    period: str
    department: str
    ranking: List[AgentRankingItem]
