from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "爬虫任务管理平台"
    database_url: str = "sqlite+aiosqlite:///./data/spider.db"
    data_dir: Path = Path(__file__).parent.parent / "data"
    scripts_dir: Path = data_dir / "scripts"
    results_dir: Path = data_dir / "results"
    host: str = "0.0.0.0"
    port: int = 8000

    proxy_check_enabled: bool = True
    proxy_check_interval: int = 30
    proxy_check_url: str = "https://httpbin.org/ip"
    proxy_check_timeout: int = 10
    default_proxy_rotation_strategy: str = "random"
    default_rate_limit_per_minute: int = 60
    default_delay_min: float = 0.5
    default_delay_max: float = 2.0

    class Config:
        env_file = ".env"


settings = Settings()

settings.data_dir.mkdir(exist_ok=True)
settings.scripts_dir.mkdir(exist_ok=True)
settings.results_dir.mkdir(exist_ok=True)
