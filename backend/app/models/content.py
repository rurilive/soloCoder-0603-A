from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from ..core.database import Base


class ContentType(Base):
    __tablename__ = "content_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    fields = relationship(
        "Field",
        back_populates="content_type",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    entries = relationship(
        "ContentEntry",
        back_populates="content_type",
        cascade="all, delete-orphan",
    )


class Field(Base):
    __tablename__ = "fields"
    __table_args__ = (UniqueConstraint("content_type_id", "name", name="uq_field_content_type_name"),)

    id = Column(Integer, primary_key=True, index=True)
    content_type_id = Column(Integer, ForeignKey("content_types.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    label = Column(String(200), nullable=False)
    field_type = Column(String(50), nullable=False)
    is_required = Column(Boolean, default=False)
    is_unique = Column(Boolean, default=False)
    is_translatable = Column(Boolean, default=True)
    default_value = Column(JSON, nullable=True)
    options = Column(JSON, nullable=True)
    description = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    content_type = relationship("ContentType", back_populates="fields")


class ContentEntry(Base):
    __tablename__ = "content_entries"

    id = Column(Integer, primary_key=True, index=True)
    content_type_id = Column(Integer, ForeignKey("content_types.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="draft")
    current_version_number = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    content_type = relationship("ContentType", back_populates="entries")
    translations = relationship(
        "EntryTranslation",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    versions = relationship(
        "ContentVersion",
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    @property
    def has_unpublished_changes(self) -> bool:
        for t in self.translations:
            if t.published_version:
                if t.draft_title != t.published_version.title:
                    return True
                if t.draft_slug != t.published_version.slug:
                    return True
                if t.draft_field_values != (t.published_version.field_values or {}):
                    return True
            elif t.draft_title or t.draft_field_values:
                return True
        return False


class EntryTranslation(Base):
    __tablename__ = "entry_translations"
    __table_args__ = (
        UniqueConstraint("entry_id", "language_code", name="uq_translation_entry_language"),
    )

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("content_entries.id", ondelete="CASCADE"), nullable=False)
    language_code = Column(String(10), nullable=False, index=True)
    draft_field_values = Column(JSON, default={})
    draft_title = Column(String(500), nullable=True)
    draft_slug = Column(String(500), nullable=True, index=True)
    is_published = Column(Boolean, default=False)
    published_version_id = Column(Integer, ForeignKey("content_versions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    entry = relationship("ContentEntry", back_populates="translations")
    published_version = relationship("ContentVersion", foreign_keys=[published_version_id])


class ContentVersion(Base):
    __tablename__ = "content_versions"
    __table_args__ = (
        UniqueConstraint("entry_id", "language_code", "version_number", name="uq_version_entry_lang_num"),
        Index("ix_content_versions_entry_lang", "entry_id", "language_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("content_entries.id", ondelete="CASCADE"), nullable=False)
    language_code = Column(String(10), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    field_values = Column(JSON, default={})
    title = Column(String(500), nullable=True)
    slug = Column(String(500), nullable=True)
    is_published = Column(Boolean, default=False)
    change_summary = Column(String(500), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    entry = relationship("ContentEntry", back_populates="versions")
