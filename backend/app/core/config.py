from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "MultiLingual CMS"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = "sqlite+aiosqlite:///./cms.db"
    SUPPORTED_LANGUAGES: List[str] = ["zh", "en", "ja", "ko", "fr", "de", "es"]
    DEFAULT_LANGUAGE: str = "zh"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"


settings = Settings()
