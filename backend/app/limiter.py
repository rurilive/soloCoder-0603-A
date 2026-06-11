import time
import hashlib
import os
import json
from datetime import datetime, timedelta
import redis
from redis import ConnectionPool

class BookingRateLimiter:
    def __init__(self, redis_host=None, redis_port=None, redis_db=None):
        self.redis_host = redis_host or os.environ.get('REDIS_HOST', 'localhost')
        self.redis_port = int(redis_port or os.environ.get('REDIS_PORT', 6379))
        self.redis_db = int(redis_db or os.environ.get('REDIS_DB', 0))
        
        self.pool = ConnectionPool(
            host=self.redis_host,
            port=self.redis_port,
            db=self.redis_db,
            decode_responses=True
        )
        self.redis_client = redis.Redis(connection_pool=self.pool)
    
    def check_rate_limit(self, key, max_requests=5, time_window=3600):
        now = time.time()
        redis_key = f"rate_limit:{key}"
        
        try:
            self.redis_client.zremrangebyscore(redis_key, 0, now - time_window)
            
            count = self.redis_client.zcard(redis_key)
            if count >= max_requests:
                return False
            
            self.redis_client.zadd(redis_key, {now: now})
            self.redis_client.expire(redis_key, time_window)
            
            return True
        except redis.RedisError:
            return True
    
    def get_remaining_requests(self, key, max_requests=5, time_window=3600):
        now = time.time()
        redis_key = f"rate_limit:{key}"
        
        try:
            self.redis_client.zremrangebyscore(redis_key, 0, now - time_window)
            count = self.redis_client.zcard(redis_key)
            return max_requests - count
        except redis.RedisError:
            return max_requests
    
    def store_captcha(self, captcha_id, captcha_text, expires_minutes=5):
        redis_key = f"captcha:{captcha_id}"
        captcha_data = {
            'text': captcha_text,
            'expires': (datetime.now() + timedelta(minutes=expires_minutes)).isoformat()
        }
        
        try:
            self.redis_client.set(redis_key, json.dumps(captcha_data), ex=expires_minutes * 60)
        except redis.RedisError:
            pass
    
    def verify_captcha(self, captcha_id, captcha_text):
        redis_key = f"captcha:{captcha_id}"
        
        try:
            captcha_data_str = self.redis_client.get(redis_key)
            if not captcha_data_str:
                return False
            
            captcha_data = json.loads(captcha_data_str)
            
            if datetime.now() > datetime.fromisoformat(captcha_data['expires']):
                self.redis_client.delete(redis_key)
                return False
            
            if captcha_data['text'].lower() == captcha_text.lower():
                self.redis_client.delete(redis_key)
                return True
            
            return False
        except (redis.RedisError, json.JSONDecodeError):
            return False
    
    def generate_captcha_id(self):
        return hashlib.md5(f"{time.time()}{hash(time.time())}".encode()).hexdigest()

limiter = BookingRateLimiter()