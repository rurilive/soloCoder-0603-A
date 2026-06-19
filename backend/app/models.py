from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, Date, Index
from sqlalchemy.orm import relationship
from datetime import datetime

from .database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(200), unique=True, nullable=False)
    department = Column(String(100))
    avatar = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Integer, default=1)

    tickets = relationship("Ticket", back_populates="agent")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="open")
    priority = Column(String(20), default="normal")
    category = Column(String(50))

    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
    customer_name = Column(String(100))
    customer_email = Column(String(200))

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    assigned_at = Column(DateTime, nullable=True)
    first_response_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    satisfaction_score = Column(Integer, nullable=True)
    sla_breached = Column(Integer, default=0)
    sla_deadline = Column(DateTime, nullable=True)

    agent = relationship("Agent", back_populates="tickets")

    __table_args__ = (
        Index("idx_ticket_agent_created", "agent_id", "created_at"),
        Index("idx_ticket_status_created", "status", "created_at"),
    )


class AgentDailyStats(Base):
    __tablename__ = "mv_agent_daily_stats"

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, index=True)
    stat_date = Column(Date, index=True)
    ticket_count = Column(Integer, default=0)
    avg_response_time = Column(Float, default=0)
    resolution_rate = Column(Float, default=0)
    sla_compliance_rate = Column(Float, default=0)
    resolved_count = Column(Integer, default=0)
    avg_satisfaction = Column(Float, default=0)

    __table_args__ = (
        Index("idx_mv_agent_date", "agent_id", "stat_date", unique=True),
    )


class TeamDailyStats(Base):
    __tablename__ = "mv_team_daily_stats"

    id = Column(Integer, primary_key=True)
    stat_date = Column(Date, index=True)
    department = Column(String(100), default="all")
    ticket_count = Column(Integer, default=0)
    avg_response_time = Column(Float, default=0)
    resolution_rate = Column(Float, default=0)
    sla_compliance_rate = Column(Float, default=0)
    agent_count = Column(Integer, default=0)


class TeamDeptDailyStats(Base):
    __tablename__ = "mv_team_dept_daily_stats"

    id = Column(Integer, primary_key=True)
    stat_date = Column(Date, index=True)
    department = Column(String(100), index=True)
    ticket_count = Column(Integer, default=0)
    avg_response_time = Column(Float, default=0)
    resolution_rate = Column(Float, default=0)
    sla_compliance_rate = Column(Float, default=0)
    agent_count = Column(Integer, default=0)

    __table_args__ = (
        Index("idx_mv_team_dept_date", "department", "stat_date", unique=True),
    )
