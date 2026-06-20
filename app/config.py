from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "sqlite:///./doc_preview.db"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    upload_dir: str = "./uploads"
    preview_dir: str = "./previews"
    max_file_size: int = 104857600
    converter_service_url: str = "http://localhost:8001"
    slow_request_threshold_seconds: float = 2.0
    pdf_native_enabled: bool = True
    convert_timeout_seconds: int = 600
    convert_poll_max_retries: int = 300

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
