from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from ..database import get_db
from ..models import Hotel, Room, Order
from ..schemas import Hotel as HotelSchema, HotelCreate, HotelUpdate, Room as RoomSchema

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

@router.get("/hotels/{hotel_id}", response_model=HotelSchema)
def get_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    return hotel