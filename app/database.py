from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from urllib.parse import urlparse

from app.config import get_settings

settings = get_settings()


def get_engine_url() -> str:
    url = settings.database_url
    if url.startswith("sqlite"):
        return url
    parsed = urlparse(url)
    if parsed.scheme in ("postgresql", "postgres"):
        return url
    return url


engine = create_engine(
    get_engine_url(),
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
