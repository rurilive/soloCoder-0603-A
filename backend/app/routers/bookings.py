from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date

from ..database import get_db
from ..models import Room, Hotel, Order
from ..schemas import BookingCreate, Order as OrderSchema
from ..utils import generate_order_no, calculate_nights, calculate_total_price

router = APIRouter()

@router.post("/bookings", response_model=OrderSchema)
def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == booking.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    hotel = db.query(Hotel).filter(Hotel.id == room.hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    if booking.check_in >= booking.check_out:
        raise HTTPException(status_code=400, detail="Check-out date must be after check-in date")
    
    nights = calculate_nights(booking.check_in, booking.check_out)
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Invalid date range")
    
    active_orders = db.query(Order).filter(
        Order.room_id == booking.room_id,
        Order.status != "cancelled",
        (Order.check_in <= booking.check_out) & (Order.check_out >= booking.check_in)
    ).count()
    
    if active_orders >= room.room_count:
        raise HTTPException(status_code=400, detail="No available rooms for the selected dates")
    
    total_price = calculate_total_price(room.price_per_night, nights)
    order_no = generate_order_no()
    
    new_order = Order(
        order_no=order_no,
        hotel_id=room.hotel_id,
        room_id=booking.room_id,
        guest_name=booking.guest_name,
        guest_phone=booking.guest_phone,
        guest_email=booking.guest_email,
        check_in=booking.check_in,
        check_out=booking.check_out,
        nights=nights,
        total_price=total_price,
        status="confirmed",
        special_requests=booking.special_requests
    )
    
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    return new_order