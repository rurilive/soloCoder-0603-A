from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Hotel, Room, Order
from ..schemas import HotelCreate, HotelUpdate, RoomCreate, RoomUpdate, Hotel as HotelSchema, Room as RoomSchema, StatsResponse

router = APIRouter()

@router.post("/admin/hotels", response_model=HotelSchema)
def create_hotel(hotel: HotelCreate, db: Session = Depends(get_db)):
    new_hotel = Hotel(
        name=hotel.name,
        city=hotel.city,
        address=hotel.address,
        description=hotel.description,
        star_rating=hotel.star_rating,
        image_url=hotel.image_url,
        amenities=hotel.amenities,
        min_price=0.0
    )
    db.add(new_hotel)
    db.commit()
    db.refresh(new_hotel)
    return new_hotel

@router.put("/admin/hotels/{hotel_id}", response_model=HotelSchema)
def update_hotel(hotel_id: int, hotel: HotelUpdate, db: Session = Depends(get_db)):
    db_hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not db_hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    for key, value in hotel.model_dump().items():
        setattr(db_hotel, key, value)
    
    db.commit()
    db.refresh(db_hotel)
    return db_hotel

@router.delete("/admin/hotels/{hotel_id}")
def delete_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    db.delete(hotel)
    db.commit()
    return {"message": "Hotel deleted successfully"}

@router.post("/admin/hotels/{hotel_id}/rooms", response_model=RoomSchema)
def create_room(hotel_id: int, room: RoomCreate, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    new_room = Room(
        hotel_id=hotel_id,
        name=room.name,
        description=room.description,
        price_per_night=room.price_per_night,
        max_guests=room.max_guests,
        bed_type=room.bed_type,
        room_count=room.room_count,
        image_url=room.image_url
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    
    hotel.min_price = min(hotel.min_price, room.price_per_night) if hotel.min_price > 0 else room.price_per_night
    db.commit()
    
    return new_room

@router.put("/admin/rooms/{room_id}", response_model=RoomSchema)
def update_room(room_id: int, room: RoomUpdate, db: Session = Depends(get_db)):
    db_room = db.query(Room).filter(Room.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    old_price = db_room.price_per_night
    for key, value in room.model_dump().items():
        setattr(db_room, key, value)
    
    db.commit()
    db.refresh(db_room)
    
    hotel = db.query(Hotel).filter(Hotel.id == db_room.hotel_id).first()
    if hotel:
        min_price = min(r.price_per_night for r in hotel.rooms)
        hotel.min_price = min_price
        db.commit()
    
    return db_room

@router.delete("/admin/rooms/{room_id}")
def delete_room(room_id: int, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    hotel_id = room.hotel_id
    db.delete(room)
    db.commit()
    
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if hotel and hotel.rooms:
        min_price = min(r.price_per_night for r in hotel.rooms)
        hotel.min_price = min_price
        db.commit()
    
    return {"message": "Room deleted successfully"}

@router.get("/admin/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total_orders = db.query(Order).count()
    total_revenue = db.query(Order).filter(Order.status == "completed").with_entities(Order.total_price).all()
    total_revenue = sum(r[0] for r in total_revenue)
    
    pending_orders = db.query(Order).filter(Order.status == "pending").count()
    confirmed_orders = db.query(Order).filter(Order.status == "confirmed").count()
    cancelled_orders = db.query(Order).filter(Order.status == "cancelled").count()
    completed_orders = db.query(Order).filter(Order.status == "completed").count()
    
    return {
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "pending_orders": pending_orders,
        "confirmed_orders": confirmed_orders,
        "cancelled_orders": cancelled_orders,
        "completed_orders": completed_orders
    }