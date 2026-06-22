import os
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


_INSECURE_DEFAULT_SECRET = "your-secret-key-change-in-production-please-change-me-now-2024"


class Settings(BaseSettings):
    PROJECT_NAME: str = "MultiLingual CMS"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = "sqlite+aiosqlite:///./cms.db"
    SUPPORTED_LANGUAGES: List[str] = ["zh", "en", "ja", "ko", "fr", "de", "es"]
    DEFAULT_LANGUAGE: str = "zh"
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    CORS_ORIGINS: List[str] = ["*"]

    STATIC_SITE_OUTPUT_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static_site")
    STATIC_SITE_BASE_URL: str = "/"
    STATIC_SITE_ENABLED: bool = True
    STATIC_SITE_AUTO_GENERATE: bool = True

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def _validate_secret_key(self):
        if not self.SECRET_KEY or self.SECRET_KEY == _INSECURE_DEFAULT_SECRET:
            raise RuntimeError(
                "❌ 安全配置错误：环境变量 SECRET_KEY 未设置或仍使用默认值！\n"
                "请在启动前通过环境变量或 .env 文件设置一个足够长且随机的密钥，例如：\n"
                "  export SECRET_KEY=$(python3 -c \"import secrets; print(secrets.token_urlsafe(64))\")"
            )
        if len(self.SECRET_KEY) < 32:
            raise RuntimeError(
                f"❌ 安全配置错误：SECRET_KEY 长度不足（当前 {len(self.SECRET_KEY)} 字符），至少需要 32 字符！"
            )
        return self


settings = Settings()
