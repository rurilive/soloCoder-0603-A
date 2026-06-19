from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./ticket_system.db"
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl: int = 300
    api_prefix: str = "/api"

    SECRET_KEY: str = "your-secret-key-change-in-production-please-make-it-long-and-random-1234567890"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()
