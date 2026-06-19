from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./ticket_dashboard.db"
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl: int = 300
    api_prefix: str = "/api"

    class Config:
        env_file = ".env"


settings = Settings()
