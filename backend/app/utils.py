from datetime import datetime, date
import random

def generate_order_no():
    today = datetime.now().strftime("%Y%m%d")
    random_suffix = ''.join(random.choices('0123456789', k=4))
    return f"HTL{today}{random_suffix}"

def calculate_nights(check_in: date, check_out: date) -> int:
    return (check_out - check_in).days

def calculate_total_price(price_per_night: float, nights: int) -> float:
    return round(price_per_night * nights, 2)