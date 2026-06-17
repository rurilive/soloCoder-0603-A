from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_db
from app.models import Ticket, TicketRating, TicketStatus, UserRole
from app.schemas import RatingCreate, RatingOut

router = APIRouter()


@router.post("/{ticket_id}/rating", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
async def create_rating(
    ticket_id: int,
    body: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your ticket")
    if ticket.status != TicketStatus.resolved and ticket.status != TicketStatus.closed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket must be resolved or closed to rate")

    existing = await db.execute(select(TicketRating).where(TicketRating.ticket_id == ticket_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already rated")

    rating = TicketRating(
        ticket_id=ticket_id,
        user_id=current_user.id,
        score=body.score,
        comment=body.comment,
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)
    return rating


@router.get("/{ticket_id}/rating", response_model=RatingOut)
async def get_rating(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TicketRating).where(TicketRating.ticket_id == ticket_id))
    rating = result.scalar_one_or_none()
    if not rating:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
    return rating
