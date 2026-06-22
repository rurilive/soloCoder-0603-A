import hashlib
import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Index
from sqlalchemy.orm import relationship

from ..core.database import Base


class StaticPage(Base):
    __tablename__ = "static_pages"
    __table_args__ = (
        Index("ix_static_pages_lookup", "content_type_slug", "entry_id", "language_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    page_path = Column(String(500), unique=True, nullable=False, index=True)
    page_type = Column(String(50), nullable=False)
    content_type_slug = Column(String(100), nullable=True)
    entry_id = Column(Integer, nullable=True)
    language_code = Column(String(10), nullable=False, index=True)
    content_hash = Column(String(64), nullable=True)
    is_generated = Column(Boolean, default=False)
    last_generated_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def compute_content_hash(data: dict) -> str:
        raw = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
