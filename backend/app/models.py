import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    user = "user"
    agent = "agent"
    admin = "admin"


class TicketStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class TicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class ActionType(str, enum.Enum):
    escalate = "escalate"
    transfer = "transfer"
    close = "close"
    reopen = "reopen"


class SLAEventType(str, enum.Enum):
    response_warning = "response_warning"
    response_breached = "response_breached"
    resolution_warning = "resolution_warning"
    resolution_breached = "resolution_breached"
    auto_escalated = "auto_escalated"


class SLAStatus(str, enum.Enum):
    on_track = "on_track"
    response_warning = "response_warning"
    response_breached = "response_breached"
    resolution_warning = "resolution_warning"
    resolution_breached = "resolution_breached"
    resolved = "resolved"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tickets: Mapped[list["Ticket"]] = relationship("Ticket", foreign_keys="Ticket.user_id", back_populates="user")
    assigned_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.agent_id", back_populates="agent"
    )
    messages: Mapped[list["TicketMessage"]] = relationship("TicketMessage", back_populates="sender")
    ratings: Mapped[list["TicketRating"]] = relationship("TicketRating", back_populates="user")


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus), default=TicketStatus.pending, nullable=False
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority), default=TicketPriority.medium, nullable=False
    )
    category: Mapped[str] = mapped_column(String(50), default="general", nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    agent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="tickets")
    agent: Mapped["User | None"] = relationship("User", foreign_keys=[agent_id], back_populates="assigned_tickets")
    messages: Mapped[list["TicketMessage"]] = relationship(
        "TicketMessage", back_populates="ticket", order_by="TicketMessage.created_at"
    )
    actions: Mapped[list["TicketAction"]] = relationship(
        "TicketAction", back_populates="ticket", order_by="TicketAction.created_at"
    )
    rating: Mapped["TicketRating | None"] = relationship("TicketRating", back_populates="ticket", uselist=False)
    sla: Mapped["TicketSLA | None"] = relationship("TicketSLA", back_populates="ticket", uselist=False)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), nullable=False)
    sender_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="messages")
    sender: Mapped["User"] = relationship("User", back_populates="messages")


class TicketAction(Base):
    __tablename__ = "ticket_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), nullable=False)
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType), nullable=False)
    from_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    to_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="actions")
    from_user: Mapped["User | None"] = relationship("User", foreign_keys=[from_user_id])
    to_user: Mapped["User | None"] = relationship("User", foreign_keys=[to_user_id])


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="general", nullable=False)
    tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TicketRating(Base):
    __tablename__ = "ticket_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="rating")
    user: Mapped["User"] = relationship("User", back_populates="ratings")


class SLARule(Base):
    __tablename__ = "sla_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    priority: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority), nullable=False)
    response_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    warning_threshold: Mapped[float] = mapped_column(Float, default=0.75, nullable=False)
    auto_escalate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    sla_tickets: Mapped[list["TicketSLA"]] = relationship("TicketSLA", back_populates="rule")


class TicketSLA(Base):
    __tablename__ = "ticket_sla"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), unique=True, nullable=False)
    sla_rule_id: Mapped[int] = mapped_column(Integer, ForeignKey("sla_rules.id"), nullable=False)
    response_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    response_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolution_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    response_warning_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolution_warning_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalated_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="sla")
    rule: Mapped["SLARule"] = relationship("SLARule", back_populates="sla_tickets")
    events: Mapped[list["SLAEvent"]] = relationship("SLAEvent", back_populates="ticket_sla")


class SLAEvent(Base):
    __tablename__ = "sla_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_sla_id: Mapped[int] = mapped_column(Integer, ForeignKey("ticket_sla.id"), nullable=False)
    event_type: Mapped[SLAEventType] = mapped_column(Enum(SLAEventType), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticket_sla: Mapped["TicketSLA"] = relationship("TicketSLA", back_populates="events")
