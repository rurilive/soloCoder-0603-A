from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, datetime, timedelta
import re

from ..database import get_db
from ..models import Room, Hotel, Order, RoomInventoryLock
from ..schemas import BookingCreate, Order as OrderSchema
from ..utils import generate_order_no, calculate_nights, calculate_final_price
from ..limiter import limiter

router = APIRouter()

LOCK_DURATION_MINUTES = 30

def validate_phone(phone: str) -> bool:
    pattern = r'^1[3-9]\d{9}$'
    return re.match(pattern, phone) is not None

def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip
    return request.client.host

@router.post("/bookings", response_model=OrderSchema)
def create_booking(booking: BookingCreate, db: Session = Depends(get_db), request: Request = Depends()):
    if not validate_phone(booking.guest_phone):
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    client_ip = get_client_ip(request)
    ip_key = f"booking_ip_{client_ip}"
    
    if not limiter.check_rate_limit(ip_key, max_requests=5, time_window=3600):
        raise HTTPException(status_code=429, detail="Too many bookings from this IP, please try again later")
    
    phone_key = f"booking_phone_{booking.guest_phone}"
    if not limiter.check_rate_limit(phone_key, max_requests=3, time_window=86400):
        raise HTTPException(status_code=429, detail="Too many bookings from this phone number, please try again tomorrow")
    
    if not booking.captcha_id or not booking.captcha_text:
        raise HTTPException(status_code=400, detail="Captcha is required")
    
    if not limiter.verify_captcha(booking.captcha_id, booking.captcha_text):
        raise HTTPException(status_code=400, detail="Invalid captcha")
    
    if booking.check_in >= booking.check_out:
        raise HTTPException(status_code=400, detail="Check-out date must be after check-in date")
    
    nights = calculate_nights(booking.check_in, booking.check_out)
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Invalid date range")
    
    try:
        room = db.query(Room).filter(Room.id == booking.room_id).with_for_update().first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        hotel = db.query(Hotel).filter(Hotel.id == room.hotel_id).first()
        if not hotel:
            raise HTTPException(status_code=404, detail="Hotel not found")
        
        now = datetime.now()
        
        locked_until = now + timedelta(minutes=LOCK_DURATION_MINUTES)
        
        active_lock_count = db.query(RoomInventoryLock).filter(
            and_(
                RoomInventoryLock.room_id == booking.room_id,
                RoomInventoryLock.check_in < booking.check_out,
                RoomInventoryLock.check_out > booking.check_in,
                RoomInventoryLock.locked_until > now
            )
        ).count()
        
        if active_lock_count > 0:
            raise HTTPException(status_code=400, detail="Room is temporarily locked, please try again later")
        
        occupied_count = db.query(Order).filter(
            and_(
                Order.room_id == booking.room_id,
                Order.status.in_(["confirmed", "pending"]),
                Order.check_in < booking.check_out,
                Order.check_out > booking.check_in,
                or_(
                    Order.status == "confirmed",
                    Order.locked_until > now
                )
            )
        ).count()
        
        total_occupied = occupied_count + active_lock_count
        
        if total_occupied >= room.room_count:
            raise HTTPException(status_code=400, detail="No available rooms for the selected dates")
        
        inventory_lock = RoomInventoryLock(
            room_id=booking.room_id,
            check_in=booking.check_in,
            check_out=booking.check_out,
            locked_at=now,
            locked_until=locked_until
        )
        db.add(inventory_lock)
        db.flush()
        
        price_result = calculate_final_price(db, booking.room_id, booking.check_in, booking.check_out)
        total_price = price_result['final_total']
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
            status="pending",
            locked_until=locked_until,
            special_requests=booking.special_requests
        )
        
        db.add(new_order)
        db.flush()
        
        inventory_lock.order_id = new_order.id
        
        db.commit()
        db.refresh(new_order)
        
        return new_order
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Booking failed: {str(e)}")

@router.post("/bookings/{order_id}/confirm")
def confirm_booking(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending orders can be confirmed")
    
    if order.locked_until and order.locked_until < datetime.now():
        raise HTTPException(status_code=400, detail="Order has expired, please create a new booking")
    
    order.status = "confirmed"
    order.locked_until = None
    
    db.query(RoomInventoryLock).filter(
        RoomInventoryLock.order_id == order_id
    ).delete()
    
    db.commit()
    db.refresh(order)
    
    return {"status": "success", "message": "Booking confirmed successfully"}

@router.post("/bookings/{order_id}/release")
def release_booking(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status == "confirmed":
        raise HTTPException(status_code=400, detail="Cannot release a confirmed order")
    
    order.status = "cancelled"
    order.locked_until = None
    
    db.query(RoomInventoryLock).filter(
        RoomInventoryLock.order_id == order_id
    ).delete()
    
    db.commit()
    db.refresh(order)
    
    return {"status": "success", "message": "Booking released successfully"}