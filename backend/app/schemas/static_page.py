from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class StaticPageBase(BaseModel):
    page_path: str = Field(..., max_length=500)
    page_type: str = Field(..., max_length=50)
    content_type_slug: Optional[str] = Field(None, max_length=100)
    entry_id: Optional[int] = None
    language_code: str = Field(..., max_length=10)


class StaticPageResponse(StaticPageBase):
    id: int
    content_hash: Optional[str] = None
    is_generated: bool = False
    last_generated_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    content_type_slug: Optional[str] = Field(None, description="Generate pages for specific content type")
    entry_id: Optional[int] = Field(None, description="Generate page for specific entry")
    language_code: Optional[str] = Field(None, description="Generate for specific language")
    full_regeneration: bool = Field(False, description="Force full regeneration ignoring content hash")


class GenerateResult(BaseModel):
    total: int = 0
    generated: int = 0
    skipped: int = 0
    failed: int = 0
    errors: List[Dict[str, Any]] = []
    generated_pages: List[str] = []


class StaticSiteStats(BaseModel):
    total_pages: int = 0
    generated_pages: int = 0
    pending_pages: int = 0
    failed_pages: int = 0
    languages: List[str] = []
    content_types: List[str] = []
    last_generated_at: Optional[datetime] = None
    output_directory: str
