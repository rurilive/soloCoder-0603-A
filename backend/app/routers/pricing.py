from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List

from ..database import get_db
from ..models import PriceCalendar, StayDiscount, Room
from ..schemas import (
    PriceCalendarCreate, 
    PriceCalendarUpdate, 
    PriceCalendar,
    PriceCalendarBatchCreate,
    StayDiscountCreate,
    StayDiscountUpdate,
    StayDiscount,
    PriceCalculationRequest,
    PriceCalculationResponse
)
from ..utils import calculate_final_price

router = APIRouter()

@router.post("/admin/price-calendars", response_model=PriceCalendar)
def create_price_calendar(calendar: PriceCalendarCreate, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == calendar.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    existing = db.query(PriceCalendar).filter(
        PriceCalendar.room_id == calendar.room_id,
        PriceCalendar.date == calendar.date
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Price already set for this date")
    
    new_calendar = PriceCalendar(
        room_id=calendar.room_id,
        date=calendar.date,
        price=calendar.price
    )
    
    db.add(new_calendar)
    db.commit()
    db.refresh(new_calendar)
    return new_calendar

@router.post("/admin/price-calendars/batch")
def batch_create_price_calendars(batch: PriceCalendarBatchCreate, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == batch.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if batch.start_date > batch.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")
    
    current_date = batch.start_date
    created_count = 0
    
    while current_date <= batch.end_date:
        existing = db.query(PriceCalendar).filter(
            PriceCalendar.room_id == batch.room_id,
            PriceCalendar.date == current_date
        ).first()
        
        if not existing:
            new_calendar = PriceCalendar(
                room_id=batch.room_id,
                date=current_date,
                price=batch.price
            )
            db.add(new_calendar)
            created_count += 1
        
        current_date += timedelta(days=1)
    
    db.commit()
    return {"message": f"Created {created_count} price calendar entries"}

@router.get("/admin/price-calendars/room/{room_id}", response_model=List[PriceCalendar])
def get_price_calendars_by_room(room_id: int, db: Session = Depends(get_db)):
    calendars = db.query(PriceCalendar).filter(
        PriceCalendar.room_id == room_id
    ).order_by(PriceCalendar.date).all()
    return calendars

@router.get("/admin/price-calendars/{calendar_id}", response_model=PriceCalendar)
def get_price_calendar(calendar_id: int, db: Session = Depends(get_db)):
    calendar = db.query(PriceCalendar).filter(PriceCalendar.id == calendar_id).first()
    if not calendar:
        raise HTTPException(status_code=404, detail="Price calendar not found")
    return calendar

@router.put("/admin/price-calendars/{calendar_id}", response_model=PriceCalendar)
def update_price_calendar(calendar_id: int, update: PriceCalendarUpdate, db: Session = Depends(get_db)):
    calendar = db.query(PriceCalendar).filter(PriceCalendar.id == calendar_id).first()
    if not calendar:
        raise HTTPException(status_code=404, detail="Price calendar not found")
    
    calendar.price = update.price
    db.commit()
    db.refresh(calendar)
    return calendar

@router.delete("/admin/price-calendars/{calendar_id}")
def delete_price_calendar(calendar_id: int, db: Session = Depends(get_db)):
    calendar = db.query(PriceCalendar).filter(PriceCalendar.id == calendar_id).first()
    if not calendar:
        raise HTTPException(status_code=404, detail="Price calendar not found")
    
    db.delete(calendar)
    db.commit()
    return {"message": "Price calendar deleted successfully"}

@router.post("/admin/stay-discounts", response_model=StayDiscount)
def create_stay_discount(discount: StayDiscountCreate, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == discount.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if discount.start_date > discount.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")
    
    new_discount = StayDiscount(
        room_id=discount.room_id,
        min_nights=discount.min_nights,
        discount_percent=discount.discount_percent,
        start_date=discount.start_date,
        end_date=discount.end_date,
        is_active=discount.is_active
    )
    
    db.add(new_discount)
    db.commit()
    db.refresh(new_discount)
    return new_discount

@router.get("/admin/stay-discounts/room/{room_id}", response_model=List[StayDiscount])
def get_stay_discounts_by_room(room_id: int, db: Session = Depends(get_db)):
    discounts = db.query(StayDiscount).filter(
        StayDiscount.room_id == room_id
    ).order_by(StayDiscount.min_nights).all()
    return discounts

@router.get("/admin/stay-discounts/{discount_id}", response_model=StayDiscount)
def get_stay_discount(discount_id: int, db: Session = Depends(get_db)):
    discount = db.query(StayDiscount).filter(StayDiscount.id == discount_id).first()
    if not discount:
        raise HTTPException(status_code=404, detail="Stay discount not found")
    return discount

@router.put("/admin/stay-discounts/{discount_id}", response_model=StayDiscount)
def update_stay_discount(discount_id: int, update: StayDiscountUpdate, db: Session = Depends(get_db)):
    discount = db.query(StayDiscount).filter(StayDiscount.id == discount_id).first()
    if not discount:
        raise HTTPException(status_code=404, detail="Stay discount not found")
    
    if update.min_nights is not None:
        discount.min_nights = update.min_nights
    if update.discount_percent is not None:
        discount.discount_percent = update.discount_percent
    if update.start_date is not None:
        discount.start_date = update.start_date
    if update.end_date is not None:
        discount.end_date = update.end_date
    if update.is_active is not None:
        discount.is_active = update.is_active
    
    db.commit()
    db.refresh(discount)
    return discount

@router.delete("/admin/stay-discounts/{discount_id}")
def delete_stay_discount(discount_id: int, db: Session = Depends(get_db)):
    discount = db.query(StayDiscount).filter(StayDiscount.id == discount_id).first()
    if not discount:
        raise HTTPException(status_code=404, detail="Stay discount not found")
    
    db.delete(discount)
    db.commit()
    return {"message": "Stay discount deleted successfully"}

@router.post("/pricing/calculate", response_model=PriceCalculationResponse)
def calculate_price(request: PriceCalculationRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == request.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if request.check_in >= request.check_out:
        raise HTTPException(status_code=400, detail="Check-out date must be after check-in date")
    
    result = calculate_final_price(db, request.room_id, request.check_in, request.check_out)
    
    return PriceCalculationResponse(
        room_id=request.room_id,
        check_in=request.check_in,
        check_out=request.check_out,
        **result
    )