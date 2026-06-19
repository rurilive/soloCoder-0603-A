import json
import time
import threading
from typing import Optional, Any

try:
    import redis
except ImportError:
    redis = None

from .config import settings


class MemoryCache:
    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            item = self._cache.get(key)
            if item is None:
                return None
            value, expire_at = item
            if expire_at and time.time() > expire_at:
                del self._cache[key]
                return None
            return value

    def set(self, key: str, value: str, ttl: int = None):
        with self._lock:
            expire_at = time.time() + ttl if ttl else None
            self._cache[key] = (value, expire_at)

    def keys(self, pattern: str) -> list:
        import fnmatch
        with self._lock:
            return [k for k in self._cache.keys() if fnmatch.fnmatch(k, pattern)]

    def delete(self, key: str):
        with self._lock:
            self._cache.pop(key, None)


class CacheService:
    def __init__(self):
        self.redis_client = None
        self.memory_cache = MemoryCache()
        self.use_redis = False

        if redis is not None:
            try:
                self.redis_client = redis.from_url(settings.redis_url, decode_responses=True)
                self.redis_client.ping()
                self.use_redis = True
            except Exception:
                self.redis_client = None
                self.use_redis = False

    def get(self, key: str) -> Optional[str]:
        if self.use_redis and self.redis_client:
            try:
                return self.redis_client.get(key)
            except Exception:
                pass
        return self.memory_cache.get(key)

    def set(self, key: str, value: str, ttl: int = None):
        ttl = ttl or settings.cache_ttl
        if self.use_redis and self.redis_client:
            try:
                self.redis_client.setex(key, ttl, value)
                return
            except Exception:
                pass
        self.memory_cache.set(key, value, ttl)

    def get_json(self, key: str) -> Optional[Any]:
        data = self.get(key)
        if data:
            try:
                return json.loads(data)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def set_json(self, key: str, value: Any, ttl: int = None):
        try:
            self.set(key, json.dumps(value, default=str), ttl)
        except (TypeError, ValueError):
            pass

    def invalidate_pattern(self, pattern: str):
        if self.use_redis and self.redis_client:
            try:
                for key in self.redis_client.scan_iter(match=pattern):
                    self.redis_client.delete(key)
                return
            except Exception:
                pass
        for key in self.memory_cache.keys(pattern):
            self.memory_cache.delete(key)


cache_service = CacheService()
