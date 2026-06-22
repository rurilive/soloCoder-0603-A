from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ContentTypeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = True


class ContentTypeCreate(ContentTypeBase):
    pass


class ContentTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class FieldBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=200)
    field_type: str = Field(..., min_length=1, max_length=50)
    is_required: Optional[bool] = False
    is_unique: Optional[bool] = False
    is_translatable: Optional[bool] = True
    default_value: Optional[Any] = None
    options: Optional[List[Dict[str, Any]]] = None
    description: Optional[str] = Field(None, max_length=500)
    sort_order: Optional[int] = 0


class FieldCreate(FieldBase):
    pass


class FieldUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    label: Optional[str] = Field(None, min_length=1, max_length=200)
    field_type: Optional[str] = Field(None, min_length=1, max_length=50)
    is_required: Optional[bool] = None
    is_unique: Optional[bool] = None
    is_translatable: Optional[bool] = None
    default_value: Optional[Any] = None
    options: Optional[List[Dict[str, Any]]] = None
    description: Optional[str] = Field(None, max_length=500)
    sort_order: Optional[int] = None


class FieldResponse(FieldBase):
    id: int
    content_type_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContentTypeResponse(ContentTypeBase):
    id: int
    created_at: datetime
    updated_at: datetime
    fields: List[FieldResponse] = []

    class Config:
        from_attributes = True


class EntryTranslationBase(BaseModel):
    language_code: str = Field(..., min_length=1, max_length=10)
    draft_field_values: Optional[Dict[str, Any]] = {}
    draft_title: Optional[str] = Field(None, max_length=500)
    draft_slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = False


class EntryTranslationCreate(EntryTranslationBase):
    pass


class EntryTranslationUpdate(BaseModel):
    draft_field_values: Optional[Dict[str, Any]] = None
    draft_title: Optional[str] = Field(None, max_length=500)
    draft_slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = None


class TranslationValueCreate(BaseModel):
    language_code: str = Field(..., min_length=1, max_length=10)
    draft_field_values: Optional[Dict[str, Any]] = {}
    draft_title: Optional[str] = Field(None, max_length=500)
    draft_slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = False


class TranslationValueUpdate(BaseModel):
    draft_field_values: Optional[Dict[str, Any]] = None
    draft_title: Optional[str] = Field(None, max_length=500)
    draft_slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = None


class ContentVersionResponse(BaseModel):
    id: int
    entry_id: int
    language_code: str
    version_number: int
    field_values: Dict[str, Any] = {}
    title: Optional[str] = None
    slug: Optional[str] = None
    is_published: bool
    change_summary: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EntryTranslationResponse(EntryTranslationBase):
    id: int
    entry_id: int
    published_version_id: Optional[int] = None
    published_version: Optional[ContentVersionResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContentEntryBase(BaseModel):
    content_type_id: int
    status: Optional[str] = "draft"


class ContentEntryCreate(ContentEntryBase):
    translations: Optional[List[TranslationValueCreate]] = []


class ContentEntryUpdate(BaseModel):
    status: Optional[str] = None


class ContentEntryResponse(BaseModel):
    id: int
    content_type_id: int
    status: str
    current_version_number: int = 0
    has_unpublished_changes: bool = False
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EntryWithTranslationsResponse(ContentEntryResponse):
    translations: List[EntryTranslationResponse] = []

    class Config:
        from_attributes = True


class PublishRequest(BaseModel):
    language_code: Optional[str] = Field(None, description="Publish specific language, or all if not specified")
    change_summary: Optional[str] = Field(None, max_length=500)


class RollbackRequest(BaseModel):
    version_number: int = Field(..., description="Version number to rollback to")
    language_code: Optional[str] = Field(None, description="Rollback specific language, or all if not specified")
    change_summary: Optional[str] = Field(None, max_length=500)


class DraftPreviewResponse(BaseModel):
    entry_id: int
    language_code: str
    draft_title: Optional[str] = None
    draft_slug: Optional[str] = None
    draft_field_values: Dict[str, Any] = {}
    published_version: Optional[ContentVersionResponse] = None
    has_unpublished_changes: bool = False
