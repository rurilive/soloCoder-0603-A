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
    field_values: Optional[Dict[str, Any]] = {}
    title: Optional[str] = Field(None, max_length=500)
    slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = False


class EntryTranslationCreate(EntryTranslationBase):
    pass


class EntryTranslationUpdate(BaseModel):
    field_values: Optional[Dict[str, Any]] = None
    title: Optional[str] = Field(None, max_length=500)
    slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = None


class TranslationValueCreate(BaseModel):
    language_code: str = Field(..., min_length=1, max_length=10)
    field_values: Dict[str, Any] = {}
    title: Optional[str] = Field(None, max_length=500)
    slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = False


class TranslationValueUpdate(BaseModel):
    field_values: Optional[Dict[str, Any]] = None
    title: Optional[str] = Field(None, max_length=500)
    slug: Optional[str] = Field(None, max_length=500)
    is_published: Optional[bool] = None


class EntryTranslationResponse(EntryTranslationBase):
    id: int
    entry_id: int
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
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EntryWithTranslationsResponse(ContentEntryResponse):
    translations: List[EntryTranslationResponse] = []

    class Config:
        from_attributes = True
