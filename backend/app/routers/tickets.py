from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import User, get_current_user, require_role
from app.database import get_db
from app.models import ActionType, Ticket, TicketAction, TicketMessage, TicketPriority, TicketStatus, UserRole
from app.schemas import ActionCreate, ActionOut, TicketCreate, TicketDetailOut, TicketOut

router = APIRouter()


@router.post("/", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    body: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = Ticket(
        title=body.title,
        description=body.description,
        priority=body.priority,
        category=body.category,
        user_id=current_user.id,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/", response_model=list[TicketOut])
async def list_tickets(
    status_filter: TicketStatus | None = Query(None, alias="status"),
    priority: TicketPriority | None = Query(None),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Ticket).options(selectinload(Ticket.user), selectinload(Ticket.agent))

    if current_user.role == UserRole.user:
        query = query.where(Ticket.user_id == current_user.id)
    elif current_user.role == UserRole.agent:
        query = query.where((Ticket.agent_id == current_user.id) | (Ticket.status == TicketStatus.pending))

    if status_filter:
        query = query.where(Ticket.status == status_filter)
    if priority:
        query = query.where(Ticket.priority == priority)
    if category:
        query = query.where(Ticket.category == category)

    query = query.order_by(Ticket.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def ticket_stats(
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    base_query = select(Ticket.status, func.count(Ticket.id)).group_by(Ticket.status)
    result = await db.execute(base_query)
    counts = {row[0].value: row[1] for row in result.all()}

    total_query = select(func.count(Ticket.id))
    total_result = await db.execute(total_query)
    total = total_result.scalar()

    return {"total": total, "by_status": counts}


@router.get("/{ticket_id}", response_model=TicketDetailOut)
async def get_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.user),
            selectinload(Ticket.agent),
            selectinload(Ticket.messages).selectinload(TicketMessage.sender),
            selectinload(Ticket.actions),
            selectinload(Ticket.rating),
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user.role == UserRole.user and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if current_user.role == UserRole.agent and ticket.agent_id != current_user.id and ticket.status != TicketStatus.pending:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")

    return ticket


@router.post("/{ticket_id}/accept", response_model=TicketOut)
async def accept_ticket(
    ticket_id: int,
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket.status != TicketStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket is not pending")
    if ticket.agent_id and ticket.agent_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already assigned to another agent")

    ticket.status = TicketStatus.in_progress
    ticket.agent_id = current_user.id
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket(
    ticket_id: int,
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket.status != TicketStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket is not in progress")

    ticket.status = TicketStatus.resolved
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/close", response_model=TicketOut)
async def close_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user.role == UserRole.user and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if ticket.status != TicketStatus.resolved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket must be resolved first")

    ticket.status = TicketStatus.closed
    ticket.closed_at = datetime.now(timezone.utc)
    action = TicketAction(
        ticket_id=ticket.id,
        action_type=ActionType.close,
        from_user_id=current_user.id,
    )
    db.add(action)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/escalate", response_model=ActionOut, status_code=status.HTTP_201_CREATED)
async def escalate_ticket(
    ticket_id: int,
    body: ActionCreate,
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    priority_map = {"low": 0, "medium": 1, "high": 2, "urgent": 3}
    current_level = priority_map.get(ticket.priority.value, 0)

    if body.priority is not None:
        target_level = priority_map.get(body.priority.value, 0)
        if target_level < current_level:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Escalate priority cannot be lower than current ({ticket.priority.value})",
            )
        ticket.priority = body.priority
    elif current_level < 2:
        ticket.priority = TicketPriority.high

    action = TicketAction(
        ticket_id=ticket.id,
        action_type=ActionType.escalate,
        from_user_id=current_user.id,
        to_user_id=body.to_user_id,
        reason=body.reason,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return action


@router.post("/{ticket_id}/transfer", response_model=ActionOut, status_code=status.HTTP_201_CREATED)
async def transfer_ticket(
    ticket_id: int,
    body: ActionCreate,
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if not body.to_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target agent required")

    agent_result = await db.execute(select(User).where(User.id == body.to_user_id, User.role == UserRole.agent))
    if not agent_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target is not an agent")

    ticket.agent_id = body.to_user_id
    action = TicketAction(
        ticket_id=ticket.id,
        action_type=ActionType.transfer,
        from_user_id=current_user.id,
        to_user_id=body.to_user_id,
        reason=body.reason,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return action


@router.post("/{ticket_id}/reopen", response_model=TicketOut)
async def reopen_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if current_user.role == UserRole.user and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if ticket.status != TicketStatus.resolved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only resolved tickets can be reopened")

    ticket.status = TicketStatus.in_progress
    action = TicketAction(
        ticket_id=ticket.id,
        action_type=ActionType.reopen,
        from_user_id=current_user.id,
    )
    db.add(action)
    await db.commit()
    await db.refresh(ticket)
    return ticket
