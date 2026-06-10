from datetime import datetime, date, timedelta
import random
import re
from sqlalchemy.orm import Session
from .models import PriceCalendar, StayDiscount, Room

SENSITIVE_WORDS = [
    '脏话1', '脏话2', '脏话3', '敏感词1', '敏感词2', '敏感词3',
    '违规', '违法', '色情', '暴力', '恐怖', '反动', '邪教'
]

def generate_order_no():
    today = datetime.now().strftime("%Y%m%d")
    random_suffix = ''.join(random.choices('0123456789', k=4))
    return f"HTL{today}{random_suffix}"

def calculate_nights(check_in: date, check_out: date) -> int:
    return (check_out - check_in).days

def calculate_total_price(price_per_night: float, nights: int) -> float:
    return round(price_per_night * nights, 2)

def get_price_for_date(db: Session, room_id: int, target_date: date) -> float:
    calendar_price = db.query(PriceCalendar).filter(
        PriceCalendar.room_id == room_id,
        PriceCalendar.date == target_date
    ).first()
    
    if calendar_price:
        return calendar_price.price
    
    room = db.query(Room).filter(Room.id == room_id).first()
    if room:
        return room.price_per_night
    
    return 0.0

def get_daily_prices(db: Session, room_id: int, check_in: date, check_out: date) -> list:
    daily_prices = []
    current_date = check_in
    
    while current_date < check_out:
        price = get_price_for_date(db, room_id, current_date)
        daily_prices.append({
            'date': current_date.strftime('%Y-%m-%d'),
            'price': price
        })
        current_date += timedelta(days=1)
    
    return daily_prices

def calculate_original_total(db: Session, room_id: int, check_in: date, check_out: date) -> float:
    daily_prices = get_daily_prices(db, room_id, check_in, check_out)
    return round(sum(item['price'] for item in daily_prices), 2)

def get_applicable_discount(db: Session, room_id: int, nights: int, check_in: date, check_out: date) -> float:
    discounts = db.query(StayDiscount).filter(
        StayDiscount.room_id == room_id,
        StayDiscount.is_active == 1,
        StayDiscount.min_nights <= nights,
        StayDiscount.start_date <= check_in,
        StayDiscount.end_date >= check_out
    ).order_by(StayDiscount.min_nights.desc()).all()
    
    if discounts:
        return discounts[0]
    
    return None

def calculate_final_price(db: Session, room_id: int, check_in: date, check_out: date) -> dict:
    nights = calculate_nights(check_in, check_out)
    daily_prices = get_daily_prices(db, room_id, check_in, check_out)
    original_total = round(sum(item['price'] for item in daily_prices), 2)
    
    discount = get_applicable_discount(db, room_id, nights, check_in, check_out)
    
    if discount:
        discount_amount = round(original_total * (discount.discount_percent / 100), 2)
        final_total = round(original_total - discount_amount, 2)
        return {
            'nights': nights,
            'original_total': original_total,
            'discount': discount_amount,
            'discount_percent': discount.discount_percent,
            'final_total': final_total,
            'daily_prices': daily_prices
        }
    
    return {
        'nights': nights,
        'original_total': original_total,
        'discount': None,
        'discount_percent': None,
        'final_total': original_total,
        'daily_prices': daily_prices
    }

def filter_sensitive_words(text: str) -> str:
    if not text:
        return text
    
    for word in SENSITIVE_WORDS:
        text = re.sub(re.escape(word), '*' * len(word), text, flags=re.IGNORECASE)
    
    return text

def contains_sensitive_words(text: str) -> bool:
    if not text:
        return False
    
    for word in SENSITIVE_WORDS:
        if re.search(re.escape(word), text, re.IGNORECASE):
            return True
    
    return False