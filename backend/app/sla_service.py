from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SLAEvent, SLAEventType, SLAStatus, SLARule, Ticket, TicketPriority, TicketSLA, TicketStatus
from app.schemas import SLAStatusOut, SLARuleCreate, TicketSLADetailOut


DEFAULT_SLA_RULES = {
    ("general", TicketPriority.low): {"response": 120, "resolution": 2880},
    ("general", TicketPriority.medium): {"response": 60, "resolution": 1440},
    ("general", TicketPriority.high): {"response": 30, "resolution": 480},
    ("general", TicketPriority.urgent): {"response": 15, "resolution": 120},
    ("technical", TicketPriority.low): {"response": 120, "resolution": 4320},
    ("technical", TicketPriority.medium): {"response": 60, "resolution": 2880},
    ("technical", TicketPriority.high): {"response": 30, "resolution": 720},
    ("technical", TicketPriority.urgent): {"response": 15, "resolution": 240},
    ("billing", TicketPriority.low): {"response": 120, "resolution": 2880},
    ("billing", TicketPriority.medium): {"response": 60, "resolution": 1440},
    ("billing", TicketPriority.high): {"response": 20, "resolution": 360},
    ("billing", TicketPriority.urgent): {"response": 10, "resolution": 60},
    ("account", TicketPriority.low): {"response": 120, "resolution": 2880},
    ("account", TicketPriority.medium): {"response": 60, "resolution": 1440},
    ("account", TicketPriority.high): {"response": 20, "resolution": 360},
    ("account", TicketPriority.urgent): {"response": 10, "resolution": 120},
}


async def get_or_create_sla_rule(
    db: AsyncSession,
    category: str,
    priority: TicketPriority,
) -> SLARule:
    result = await db.execute(
        select(SLARule).where(
            SLARule.category == category,
            SLARule.priority == priority,
            SLARule.is_active.is_(True),
        )
    )
    rule = result.scalar_one_or_none()
    if rule:
        return rule

    key = (category, priority)
    if key in DEFAULT_SLA_RULES:
        defaults = DEFAULT_SLA_RULES[key]
    else:
        defaults = DEFAULT_SLA_RULES[("general", priority)]

    rule = SLARule(
        category=category,
        priority=priority,
        response_time_minutes=defaults["response"],
        resolution_time_minutes=defaults["resolution"],
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def create_ticket_sla(db: AsyncSession, ticket: Ticket) -> TicketSLA | None:
    if ticket.status in (TicketStatus.resolved, TicketStatus.closed):
        return None

    rule = await get_or_create_sla_rule(db, ticket.category, ticket.priority)
    if not rule:
        return None

    now = datetime.now(timezone.utc)
    response_deadline = now + timedelta(minutes=rule.response_time_minutes)
    resolution_deadline = now + timedelta(minutes=rule.resolution_time_minutes)

    first_response_at = None
    resolved_at = None

    if ticket.status == TicketStatus.in_progress and ticket.agent_id:
        first_response_at = now

    if ticket.status == TicketStatus.resolved:
        resolved_at = now

    sla = TicketSLA(
        ticket_id=ticket.id,
        sla_rule_id=rule.id,
        response_deadline=response_deadline,
        resolution_deadline=resolution_deadline,
        first_response_at=first_response_at,
        resolved_at=resolved_at,
        response_breached=False,
        resolution_breached=False,
    )
    db.add(sla)
    await db.commit()
    await db.refresh(sla)
    return sla


def compute_sla_status(ticket_sla: TicketSLA | None, ticket: Ticket) -> SLAStatusOut:
    if ticket_sla is None:
        return SLAStatusOut(sla_status=SLAStatus.on_track)

    now = datetime.now(timezone.utc)

    if ticket.status in (TicketStatus.resolved, TicketStatus.closed) or ticket_sla.resolved_at:
        return SLAStatusOut(
            sla_status=SLAStatus.resolved,
            response_deadline=ticket_sla.response_deadline,
            resolution_deadline=ticket_sla.resolution_deadline,
            response_remaining_minutes=None,
            resolution_remaining_minutes=None,
            response_breached=ticket_sla.response_breached,
            resolution_breached=ticket_sla.resolution_breached,
            first_response_at=ticket_sla.first_response_at,
            resolved_at=ticket_sla.resolved_at,
        )

    response_remaining = None
    if not ticket_sla.first_response_at:
        response_remaining = (ticket_sla.response_deadline - now).total_seconds() / 60.0

    resolution_remaining = (ticket_sla.resolution_deadline - now).total_seconds() / 60.0

    response_breached = ticket_sla.response_breached or (
        response_remaining is not None and response_remaining <= 0
    )
    resolution_breached = ticket_sla.resolution_breached or resolution_remaining <= 0

    if resolution_breached:
        status = SLAStatus.resolution_breached
    elif response_breached:
        status = SLAStatus.response_breached
    elif resolution_remaining <= 0:
        status = SLAStatus.resolution_breached
    else:
        warning_threshold = ticket_sla.rule.warning_threshold if ticket_sla.rule else 0.75
        rule_resolution = ticket_sla.rule.resolution_time_minutes if ticket_sla.rule else 0
        rule_response = ticket_sla.rule.response_time_minutes if ticket_sla.rule else 0

        resolution_elapsed_ratio = 1 - (resolution_remaining / rule_resolution) if rule_resolution > 0 else 0

        if response_remaining is not None and rule_response > 0:
            response_elapsed_ratio = 1 - (response_remaining / rule_response)
        else:
            response_elapsed_ratio = 0

        if resolution_elapsed_ratio >= warning_threshold:
            status = SLAStatus.resolution_warning
        elif response_elapsed_ratio >= warning_threshold and response_remaining is not None:
            status = SLAStatus.response_warning
        else:
            status = SLAStatus.on_track

    return SLAStatusOut(
        sla_status=status,
        response_deadline=ticket_sla.response_deadline,
        resolution_deadline=ticket_sla.resolution_deadline,
        response_remaining_minutes=response_remaining,
        resolution_remaining_minutes=resolution_remaining,
        response_breached=response_breached,
        resolution_breached=resolution_breached,
        first_response_at=ticket_sla.first_response_at,
        resolved_at=ticket_sla.resolved_at,
    )


async def mark_first_response(db: AsyncSession, ticket: Ticket) -> None:
    result = await db.execute(
        select(TicketSLA).options(selectinload(TicketSLA.rule)).where(TicketSLA.ticket_id == ticket.id)
    )
    ticket_sla = result.scalar_one_or_none()
    if not ticket_sla or ticket_sla.first_response_at:
        return

    now = datetime.now(timezone.utc)
    ticket_sla.first_response_at = now
    if now > ticket_sla.response_deadline:
        ticket_sla.response_breached = True
        event = SLAEvent(
            ticket_sla_id=ticket_sla.id,
            event_type=SLAEventType.response_breached,
            message="首次响应超时",
        )
        db.add(event)

    await db.commit()


async def mark_resolved(db: AsyncSession, ticket: Ticket) -> None:
    result = await db.execute(
        select(TicketSLA).options(selectinload(TicketSLA.rule)).where(TicketSLA.ticket_id == ticket.id)
    )
    ticket_sla = result.scalar_one_or_none()
    if not ticket_sla or ticket_sla.resolved_at:
        return

    now = datetime.now(timezone.utc)
    ticket_sla.resolved_at = now
    if now > ticket_sla.resolution_deadline:
        ticket_sla.resolution_breached = True
        event = SLAEvent(
            ticket_sla_id=ticket_sla.id,
            event_type=SLAEventType.resolution_breached,
            message="解决超时",
        )
        db.add(event)

    await db.commit()


async def check_and_update_sla(db: AsyncSession, ticket_sla: TicketSLA) -> TicketSLADetailOut | None:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(TicketSLA)
        .options(selectinload(TicketSLA.rule), selectinload(TicketSLA.events))
        .where(TicketSLA.id == ticket_sla.id)
    )
    ticket_sla = result.scalar_one_or_none()
    if not ticket_sla:
        return None

    changed = False

    if not ticket_sla.first_response_at and now > ticket_sla.response_deadline and not ticket_sla.response_breached:
        ticket_sla.response_breached = True
        event = SLAEvent(
            ticket_sla_id=ticket_sla.id,
            event_type=SLAEventType.response_breached,
            message="首次响应超时",
        )
        db.add(event)
        changed = True

    if now > ticket_sla.resolution_deadline and not ticket_sla.resolution_breached:
        ticket_sla.resolution_breached = True
        event = SLAEvent(
            ticket_sla_id=ticket_sla.id,
            event_type=SLAEventType.resolution_breached,
            message="解决超时",
        )
        db.add(event)
        changed = True

    rule = ticket_sla.rule
    if rule and rule.warning_threshold:
        if (
            not ticket_sla.first_response_at
            and not ticket_sla.response_warning_sent
        ):
            response_elapsed = (now - ticket_sla.created_at).total_seconds() / 60.0
            if response_elapsed >= rule.response_time_minutes * rule.warning_threshold:
                ticket_sla.response_warning_sent = True
                event = SLAEvent(
                    ticket_sla_id=ticket_sla.id,
                    event_type=SLAEventType.response_warning,
                    message=f"响应时间已超过{int(rule.warning_threshold * 100)}%，请注意及时处理",
                )
                db.add(event)
                changed = True

        if not ticket_sla.resolution_warning_sent:
            resolution_elapsed = (now - ticket_sla.created_at).total_seconds() / 60.0
            if resolution_elapsed >= rule.resolution_time_minutes * rule.warning_threshold:
                ticket_sla.resolution_warning_sent = True
                event = SLAEvent(
                    ticket_sla_id=ticket_sla.id,
                    event_type=SLAEventType.resolution_warning,
                    message=f"解决时间已超过{int(rule.warning_threshold * 100)}%，请注意及时处理",
                )
                db.add(event)
                changed = True

    if changed:
        await db.commit()
        await db.refresh(ticket_sla)

    return ticket_sla


async def create_sla_rule(db: AsyncSession, body: SLARuleCreate) -> SLARule:
    existing = await db.execute(
        select(SLARule).where(
            SLARule.category == body.category,
            SLARule.priority == body.priority,
        )
    )
    rule = existing.scalar_one_or_none()
    if rule:
        rule.response_time_minutes = body.response_time_minutes
        rule.resolution_time_minutes = body.resolution_time_minutes
        rule.warning_threshold = body.warning_threshold
        rule.auto_escalate = body.auto_escalate
        rule.is_active = True
    else:
        rule = SLARule(
            category=body.category,
            priority=body.priority,
            response_time_minutes=body.response_time_minutes,
            resolution_time_minutes=body.resolution_time_minutes,
            warning_threshold=body.warning_threshold,
            auto_escalate=body.auto_escalate,
        )
        db.add(rule)

    await db.commit()
    await db.refresh(rule)
    return rule
