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

class PriceCalendarBase(BaseModel):
    room_id: int
    date: date
    price: float

class PriceCalendarCreate(PriceCalendarBase):
    pass

class PriceCalendarUpdate(BaseModel):
    price: float

class PriceCalendar(PriceCalendarBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

class PriceCalendarBatchCreate(BaseModel):
    room_id: int
    start_date: date
    end_date: date
    price: float

class StayDiscountBase(BaseModel):
    room_id: int
    min_nights: int
    discount_percent: float
    start_date: date
    end_date: date
    is_active: Optional[int] = 1

class StayDiscountCreate(StayDiscountBase):
    pass

class StayDiscountUpdate(BaseModel):
    min_nights: Optional[int] = None
    discount_percent: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[int] = None

class StayDiscount(StayDiscountBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

class PriceCalculationRequest(BaseModel):
    room_id: int
    check_in: date
    check_out: date

class PriceCalculationResponse(BaseModel):
    room_id: int
    check_in: date
    check_out: date
    nights: int
    original_total: float
    discount: Optional[float] = None
    discount_percent: Optional[float] = None
    final_total: float
    daily_prices: List[dict] = []

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
    captcha_id: Optional[str] = None
    captcha_text: Optional[str] = None

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
    locked_until: Optional[datetime] = None
    special_requests: Optional[str] = None

class Order(OrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    hotel: Hotel
    room: Room

    class Config:
        orm_mode = True

class RoomWithAvailability(Room):
    available_count: int

    class Config:
        orm_mode = True

class HotelWithRoomAvailability(HotelBase):
    id: int
    min_price: float
    created_at: datetime
    updated_at: datetime
    rooms: List[RoomWithAvailability] = []
    average_rating: Optional[float] = None
    review_count: int

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

class ReviewBase(BaseModel):
    rating: int
    comment: Optional[str] = None

class ReviewCreate(ReviewBase):
    order_id: int

class ReviewReply(BaseModel):
    reply: str

class ReviewStatusUpdate(BaseModel):
    status: str

class Review(ReviewBase):
    id: int
    order_id: int
    hotel_id: int
    status: str
    reply: Optional[str] = None
    reply_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

class HotelRating(BaseModel):
    hotel_id: int
    average_rating: Optional[float] = None
    review_count: int

class HotelWithRating(HotelBase):
    id: int
    min_price: float
    created_at: datetime
    updated_at: datetime
    rooms: List[Room] = []
    average_rating: Optional[float] = None
    review_count: int

    class Config:
        orm_mode = True