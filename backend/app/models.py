from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, PyEnum):
    user = "user"
    agent = "agent"
    admin = "admin"


class TicketStatus(str, PyEnum):
    pending = "pending"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class TicketPriority(str, PyEnum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class ActionType(str, PyEnum):
    create = "create"
    accept = "accept"
    resolve = "resolve"
    close = "close"
    reopen = "reopen"
    transfer = "transfer"
    escalate = "escalate"


class SLAStatus(str, PyEnum):
    on_track = "on_track"
    response_warning = "response_warning"
    resolution_warning = "resolution_warning"
    response_breached = "response_breached"
    resolution_breached = "resolution_breached"
    resolved = "resolved"


class SLAEventType(str, PyEnum):
    response_warning = "response_warning"
    resolution_warning = "resolution_warning"
    response_breached = "response_breached"
    resolution_breached = "resolution_breached"
    auto_escalated = "auto_escalated"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(150))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    department: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(default=UserRole.user)
    is_senior_agent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owned_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.user_id", back_populates="user"
    )
    assigned_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.agent_id", back_populates="agent"
    )
    sent_messages: Mapped[list["TicketMessage"]] = relationship(back_populates="sender")
    actions: Mapped[list["TicketAction"]] = relationship(
        "TicketAction", foreign_keys="TicketAction.from_user_id", back_populates="from_user"
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[TicketStatus] = mapped_column(default=TicketStatus.pending)
    priority: Mapped[TicketPriority] = mapped_column(default=TicketPriority.medium)
    category: Mapped[str] = mapped_column(String(100), default="general")

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utcnow
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="owned_tickets")
    agent: Mapped["User | None"] = relationship(
        "User", foreign_keys=[agent_id], back_populates="assigned_tickets"
    )
    messages: Mapped[list["TicketMessage"]] = relationship(back_populates="ticket", cascade="all, delete-orphan")
    actions: Mapped[list["TicketAction"]] = relationship(back_populates="ticket", cascade="all, delete-orphan")
    sla: Mapped["TicketSLA | None"] = relationship(
        back_populates="ticket", uselist=False, cascade="all, delete-orphan"
    )
    rating: Mapped["TicketRating | None"] = relationship(
        back_populates="ticket", uselist=False, cascade="all, delete-orphan"
    )


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship(back_populates="sent_messages")


class TicketAction(Base):
    __tablename__ = "ticket_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"))
    action_type: Mapped[ActionType] = mapped_column()
    from_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    priority: Mapped[TicketPriority | None] = mapped_column()
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="actions")
    from_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[from_user_id], back_populates="actions"
    )


class SLARule(Base):
    __tablename__ = "sla_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(100))
    priority: Mapped[TicketPriority] = mapped_column()
    response_time_minutes: Mapped[int] = mapped_column(default=60)
    resolution_time_minutes: Mapped[int] = mapped_column(default=1440)
    warning_threshold: Mapped[float] = mapped_column(Float, default=0.75)
    auto_escalate: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sla_records: Mapped[list["TicketSLA"]] = relationship(back_populates="rule")


class TicketSLA(Base):
    __tablename__ = "ticket_sla"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"), unique=True)
    sla_rule_id: Mapped[int] = mapped_column(ForeignKey("sla_rules.id"))

    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    response_breached: Mapped[bool] = mapped_column(Boolean, default=False)
    resolution_breached: Mapped[bool] = mapped_column(Boolean, default=False)
    response_warning_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    resolution_warning_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    escalated_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="sla")
    rule: Mapped["SLARule"] = relationship(back_populates="sla_records")
    events: Mapped[list["SLAEvent"]] = relationship(back_populates="sla", cascade="all, delete-orphan")


class SLAEvent(Base):
    __tablename__ = "sla_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_sla_id: Mapped[int] = mapped_column(ForeignKey("ticket_sla.id"))
    event_type: Mapped[SLAEventType] = mapped_column()
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sla: Mapped["TicketSLA"] = relationship(back_populates="events")


class TicketRating(Base):
    __tablename__ = "ticket_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    score: Mapped[int] = mapped_column()
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship(back_populates="rating")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), default="general")
    tags: Mapped[str] = mapped_column(String(500), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_utcnow
    )
