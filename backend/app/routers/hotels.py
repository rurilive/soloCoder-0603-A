from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date, datetime

from ..database import get_db
from ..models import Hotel, Room, Order, Review
from ..schemas import Hotel as HotelSchema, HotelCreate, HotelUpdate, Room as RoomSchema, HotelWithRating, HotelWithRoomAvailability, RoomWithAvailability

router = APIRouter()

@router.get("/hotels", response_model=List[HotelSchema])
def get_hotels(
    db: Session = Depends(get_db),
    city: Optional[str] = Query(None),
    star_rating: Optional[int] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1),
    limit: int = Query(10)
):
    query = db.query(Hotel)
    
    if city:
        query = query.filter(Hotel.city == city)
    if star_rating:
        query = query.filter(Hotel.star_rating >= star_rating)
    if min_price:
        query = query.filter(Hotel.min_price >= min_price)
    if max_price:
        query = query.filter(Hotel.min_price <= max_price)
    if search:
        query = query.filter(
            (Hotel.name.ilike(f"%{search}%")) | 
            (Hotel.city.ilike(f"%{search}%")) |
            (Hotel.description.ilike(f"%{search}%"))
        )
    
    offset = (page - 1) * limit
    hotels = query.offset(offset).limit(limit).all()
    return hotels

@router.get("/hotels/{hotel_id}", response_model=HotelWithRating)
def get_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    
    rating_data = db.query(
        func.avg(Review.rating).label('average_rating'),
        func.count(Review.id).label('review_count')
    ).filter(
        Review.hotel_id == hotel_id,
        Review.status == "approved"
    ).first()
    
    result = {
        **hotel.__dict__,
        'average_rating': round(rating_data.average_rating, 1) if rating_data.average_rating else None,
        'review_count': rating_data.review_count if rating_data.review_count else 0,
        'rooms': hotel.rooms
    }
    
    return result

@router.get("/hotels/{hotel_id}/availability", response_model=HotelWithRoomAvailability)
def get_hotel_with_availability(
    hotel_id: int,
    check_in: date = Query(...),
    check_out: date = Query(...),
    db: Session = Depends(get_db)
):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    
    rating_data = db.query(
        func.avg(Review.rating).label('average_rating'),
        func.count(Review.id).label('review_count')
    ).filter(
        Review.hotel_id == hotel_id,
        Review.status == "approved"
    ).first()
    
    rooms_with_availability = []
    for room in hotel.rooms:
        occupied_count = db.query(Order).filter(
            Order.room_id == room.id,
            Order.status.in_(["confirmed", "pending"]),
            Order.locked_until.isnot(None) | (Order.status == "confirmed"),
            (Order.check_in < check_out) & (Order.check_out > check_in)
        ).filter(
            (Order.locked_until > datetime.now()) | (Order.status == "confirmed")
        ).count()
        
        available_count = max(0, room.room_count - occupied_count)
        rooms_with_availability.append({
            **room.__dict__,
            'available_count': available_count
        })
    
    result = {
        **hotel.__dict__,
        'average_rating': round(rating_data.average_rating, 1) if rating_data.average_rating else None,
        'review_count': rating_data.review_count if rating_data.review_count else 0,
        'rooms': rooms_with_availability
    }
    
    return result