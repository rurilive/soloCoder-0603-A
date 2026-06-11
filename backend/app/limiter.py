import time
import hashlib
from collections import defaultdict
from datetime import datetime, timedelta

class BookingRateLimiter:
    def __init__(self):
        self.records = defaultdict(list)
        self.captcha_storage = {}
    
    def check_rate_limit(self, key, max_requests=5, time_window=3600):
        now = time.time()
        self.records[key] = [
            timestamp for timestamp in self.records[key]
            if now - timestamp < time_window
        ]
        
        if len(self.records[key]) >= max_requests:
            return False
        
        self.records[key].append(now)
        return True
    
    def get_remaining_requests(self, key, max_requests=5, time_window=3600):
        now = time.time()
        self.records[key] = [
            timestamp for timestamp in self.records[key]
            if now - timestamp < time_window
        ]
        return max_requests - len(self.records[key])
    
    def store_captcha(self, captcha_id, captcha_text, expires_minutes=5):
        expiration = datetime.now() + timedelta(minutes=expires_minutes)
        self.captcha_storage[captcha_id] = {
            'text': captcha_text,
            'expires': expiration
        }
    
    def verify_captcha(self, captcha_id, captcha_text):
        captcha_data = self.captcha_storage.get(captcha_id)
        if not captcha_data:
            return False
        
        if datetime.now() > captcha_data['expires']:
            del self.captcha_storage[captcha_id]
            return False
        
        if captcha_data['text'].lower() == captcha_text.lower():
            del self.captcha_storage[captcha_id]
            return True
        
        return False
    
    def generate_captcha_id(self):
        return hashlib.md5(f"{time.time()}{hash(time.time())}".encode()).hexdigest()

limiter = BookingRateLimiter()