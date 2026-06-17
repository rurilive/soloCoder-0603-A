from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import User, get_current_user, require_role
from app.database import get_db
from app.models import Ticket, TicketMessage, TicketStatus, UserRole
from app.schemas import MessageCreate, MessageOut

router = APIRouter()


@router.post("/{ticket_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    ticket_id: int,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user.role == UserRole.user:
        if ticket.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
        if body.is_internal:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users cannot send internal notes")
    elif current_user.role == UserRole.agent and ticket.agent_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")

    message = TicketMessage(
        ticket_id=ticket_id,
        sender_id=current_user.id,
        content=body.content,
        is_internal=body.is_internal,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    result = await db.execute(
        select(TicketMessage)
        .options(selectinload(TicketMessage.sender))
        .where(TicketMessage.id == message.id)
    )
    return result.scalar_one()


@router.get("/{ticket_id}/messages", response_model=list[MessageOut])
async def list_messages(
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

    query = (
        select(TicketMessage)
        .options(selectinload(TicketMessage.sender))
        .where(TicketMessage.ticket_id == ticket_id)
        .order_by(TicketMessage.created_at)
    )
    if current_user.role == UserRole.user:
        query = query.where(TicketMessage.is_internal == False)

    result = await db.execute(query)
    return result.scalars().all()
