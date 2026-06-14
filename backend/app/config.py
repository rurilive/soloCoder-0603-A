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

    class Config:
        env_file = ".env"


settings = Settings()

settings.data_dir.mkdir(exist_ok=True)
settings.scripts_dir.mkdir(exist_ok=True)
settings.results_dir.mkdir(exist_ok=True)
