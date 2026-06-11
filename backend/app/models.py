from sqlalchemy import Column, Integer, String, Float, Date, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Hotel(Base):
    __tablename__ = "hotels"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    city = Column(String, index=True)
    address = Column(String)
    description = Column(Text)
    star_rating = Column(Integer)
    image_url = Column(String)
    amenities = Column(JSON)
    min_price = Column(Float)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    rooms = relationship("Room", back_populates="hotel", cascade="all, delete")
    orders = relationship("Order", back_populates="hotel")
    reviews = relationship("Review", back_populates="hotel")

class Room(Base):
    __tablename__ = "rooms"
    
    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"))
    name = Column(String)
    description = Column(Text)
    price_per_night = Column(Float)
    max_guests = Column(Integer)
    bed_type = Column(String)
    room_count = Column(Integer)
    image_url = Column(String)
    created_at = Column(DateTime, default=datetime.now)
    
    hotel = relationship("Hotel", back_populates="rooms")
    orders = relationship("Order", back_populates="room")
    price_calendars = relationship("PriceCalendar", back_populates="room", cascade="all, delete")
    stay_discounts = relationship("StayDiscount", back_populates="room", cascade="all, delete")

class PriceCalendar(Base):
    __tablename__ = "price_calendars"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"))
    date = Column(Date, index=True)
    price = Column(Float)
    created_at = Column(DateTime, default=datetime.now)
    
    room = relationship("Room", back_populates="price_calendars")

class StayDiscount(Base):
    __tablename__ = "stay_discounts"
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"))
    min_nights = Column(Integer)
    discount_percent = Column(Float)
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.now)
    
    room = relationship("Room", back_populates="stay_discounts")

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"))
    room_id = Column(Integer, ForeignKey("rooms.id"))
    guest_name = Column(String)
    guest_phone = Column(String)
    guest_email = Column(String)
    check_in = Column(Date)
    check_out = Column(Date)
    nights = Column(Integer)
    total_price = Column(Float)
    status = Column(String)
    locked_until = Column(DateTime)
    special_requests = Column(Text)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    hotel = relationship("Hotel", back_populates="orders")
    room = relationship("Room", back_populates="orders")
    review = relationship("Review", back_populates="order", uselist=False)

class Review(Base):
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"))
    rating = Column(Integer)
    comment = Column(Text)
    status = Column(String, default="pending")
    reply = Column(Text)
    reply_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    order = relationship("Order", back_populates="review")
    hotel = relationship("Hotel", back_populates="reviews")