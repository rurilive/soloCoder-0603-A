from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import List, Optional

class RoomBase(BaseModel):
    name: str
    description: Optional[str] = None
    price_per_night: float
    max_guests: int
    bed_type: str
    room_count: int
    image_url: Optional[str] = None

class RoomCreate(RoomBase):
    pass

class RoomUpdate(RoomBase):
    pass

class Room(RoomBase):
    id: int
    hotel_id: int
    created_at: datetime

    class Config:
        orm_mode = True

class HotelBase(BaseModel):
    name: str
    city: str
    address: str
    description: Optional[str] = None
    star_rating: int
    image_url: Optional[str] = None
    amenities: List[str] = []

class HotelCreate(HotelBase):
    pass

class HotelUpdate(HotelBase):
    pass

class Hotel(HotelBase):
    id: int
    min_price: float
    created_at: datetime
    updated_at: datetime
    rooms: List[Room] = []

    class Config:
        orm_mode = True

class BookingCreate(BaseModel):
    room_id: int
    guest_name: str
    guest_phone: str
    guest_email: EmailStr
    check_in: date
    check_out: date
    special_requests: Optional[str] = None

class OrderBase(BaseModel):
    order_no: str
    hotel_id: int
    room_id: int
    guest_name: str
    guest_phone: str
    guest_email: str
    check_in: date
    check_out: date
    nights: int
    total_price: float
    status: str
    special_requests: Optional[str] = None

class Order(OrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    hotel: Hotel
    room: Room

    class Config:
        orm_mode = True

class OrderStatusUpdate(BaseModel):
    status: str

class StatsResponse(BaseModel):
    total_orders: int
    total_revenue: float
    pending_orders: int
    confirmed_orders: int
    cancelled_orders: int
    completed_orders: int