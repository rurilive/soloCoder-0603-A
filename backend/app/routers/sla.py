from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import User, get_current_user, require_role
from app.database import get_db
from app.models import SLAEvent, SLAStatus, SLARule, Ticket, TicketPriority, TicketSLA, TicketStatus, UserRole
from app.schemas import (
    SLAStatusOut,
    SLARuleCreate,
    SLARuleOut,
    SLARuleUpdate,
    TicketSLADetailOut,
)
from app.sla_service import (
    check_and_update_sla,
    compute_sla_status,
    create_sla_rule,
    create_ticket_sla,
    get_or_create_sla_rule,
)

router = APIRouter()


@router.get("/rules", response_model=list[SLARuleOut])
async def list_sla_rules(
    category: str | None = Query(None),
    priority: TicketPriority | None = Query(None),
    is_active: bool | None = Query(None),
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    query = select(SLARule)
    if category:
        query = query.where(SLARule.category == category)
    if priority:
        query = query.where(SLARule.priority == priority)
    if is_active is not None:
        query = query.where(SLARule.is_active == is_active)
    query = query.order_by(SLARule.category, SLARule.priority)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/rules", response_model=SLARuleOut, status_code=status.HTTP_201_CREATED)
async def create_sla_rule_endpoint(
    body: SLARuleCreate,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    return await create_sla_rule(db, body)


@router.get("/rules/{rule_id}", response_model=SLARuleOut)
async def get_sla_rule(
    rule_id: int,
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SLARule).where(SLARule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SLA rule not found")
    return rule


@router.put("/rules/{rule_id}", response_model=SLARuleOut)
async def update_sla_rule(
    rule_id: int,
    body: SLARuleUpdate,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SLARule).where(SLARule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SLA rule not found")

    if body.response_time_minutes is not None:
        rule.response_time_minutes = body.response_time_minutes
    if body.resolution_time_minutes is not None:
        rule.resolution_time_minutes = body.resolution_time_minutes
    if body.warning_threshold is not None:
        rule.warning_threshold = body.warning_threshold
    if body.auto_escalate is not None:
        rule.auto_escalate = body.auto_escalate
    if body.is_active is not None:
        rule.is_active = body.is_active

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sla_rule(
    rule_id: int,
    current_user: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SLARule).where(SLARule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SLA rule not found")
    rule.is_active = False
    await db.commit()
    return None


@router.get("/ticket/{ticket_id}", response_model=TicketSLADetailOut)
async def get_ticket_sla(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = ticket_result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user.role == UserRole.user and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if (
        current_user.role == UserRole.agent
        and ticket.agent_id != current_user.id
        and ticket.status != TicketStatus.pending
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")

    result = await db.execute(
        select(TicketSLA)
        .options(selectinload(TicketSLA.rule), selectinload(TicketSLA.events))
        .where(TicketSLA.ticket_id == ticket_id)
    )
    ticket_sla = result.scalar_one_or_none()
    if not ticket_sla:
        ticket_sla = await create_ticket_sla(db, ticket)

    if ticket_sla:
        ticket_sla = await check_and_update_sla(db, ticket_sla)

    if not ticket_sla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SLA not found for this ticket")

    status_out = compute_sla_status(ticket_sla, ticket)
    return TicketSLADetailOut(
        id=ticket_sla.id,
        sla_status=status_out.sla_status,
        response_deadline=status_out.response_deadline,
        resolution_deadline=status_out.resolution_deadline,
        response_remaining_minutes=status_out.response_remaining_minutes,
        resolution_remaining_minutes=status_out.resolution_remaining_minutes,
        response_breached=status_out.response_breached,
        resolution_breached=status_out.resolution_breached,
        first_response_at=status_out.first_response_at,
        resolved_at=status_out.resolved_at,
        sla_rule=ticket_sla.rule,
        events=ticket_sla.events,
    )


@router.get("/ticket/{ticket_id}/status", response_model=SLAStatusOut)
async def get_ticket_sla_status(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket_result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = ticket_result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user.role == UserRole.user and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if (
        current_user.role == UserRole.agent
        and ticket.agent_id != current_user.id
        and ticket.status != TicketStatus.pending
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")

    result = await db.execute(
        select(TicketSLA)
        .options(selectinload(TicketSLA.rule))
        .where(TicketSLA.ticket_id == ticket_id)
    )
    ticket_sla = result.scalar_one_or_none()
    if not ticket_sla:
        ticket_sla = await create_ticket_sla(db, ticket)
        if ticket_sla:
            result = await db.execute(
                select(TicketSLA)
                .options(selectinload(TicketSLA.rule))
                .where(TicketSLA.id == ticket_sla.id)
            )
            ticket_sla = result.scalar_one_or_none()

    if ticket_sla:
        await check_and_update_sla(db, ticket_sla)

    return compute_sla_status(ticket_sla, ticket)
