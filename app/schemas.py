from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from app.models import UserRole, DocumentStatus, PermissionLevel, ConvertTaskStatus


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentBase(BaseModel):
    original_filename: str
    file_type: str
    mime_type: Optional[str] = None
    watermark_enabled: bool = False
    watermark_text: Optional[str] = None
    is_public: bool = False


class DocumentCreate(DocumentBase):
    filename: str
    file_path: str
    file_size: int
    owner_id: int


class DocumentUpdate(BaseModel):
    watermark_enabled: Optional[bool] = None
    watermark_text: Optional[str] = None
    is_public: Optional[bool] = None


class DocumentResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    mime_type: Optional[str] = None
    preview_type: Optional[str] = None
    status: DocumentStatus
    watermark_enabled: bool
    watermark_text: Optional[str] = None
    is_public: bool
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PermissionBase(BaseModel):
    document_id: int
    user_id: int
    permission_level: PermissionLevel = PermissionLevel.VIEW


class PermissionCreate(PermissionBase):
    pass


class PermissionUpdate(BaseModel):
    permission_level: Optional[PermissionLevel] = None


class PermissionResponse(PermissionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ConvertRequest(BaseModel):
    watermark_text: Optional[str] = None
    watermark_enabled: bool = False


class UserBrief(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class AnnotationBase(BaseModel):
    document_id: int
    page: int = 1
    position_x: int = 0
    position_y: int = 0
    selected_text: Optional[str] = None
    content: str
    color: Optional[str] = "#fef3c7"


class AnnotationCreate(AnnotationBase):
    pass


class AnnotationUpdate(BaseModel):
    content: Optional[str] = None
    color: Optional[str] = None
    is_resolved: Optional[bool] = None


class AnnotationReplyBase(BaseModel):
    content: str


class AnnotationReplyCreate(AnnotationReplyBase):
    pass


class AnnotationReplyUpdate(BaseModel):
    content: Optional[str] = None


class AnnotationReplyResponse(AnnotationReplyBase):
    id: int
    annotation_id: int
    author: UserBrief
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnotationResponse(AnnotationBase):
    id: int
    author: UserBrief
    is_resolved: bool
    created_at: datetime
    updated_at: datetime
    replies: List[AnnotationReplyResponse] = []

    class Config:
        from_attributes = True


class DocumentContentResponse(BaseModel):
    document_id: int
    content: str
    version: int
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentContentUpdate(BaseModel):
    content: str
    base_version: int
    change_summary: Optional[str] = None


class DocumentVersionResponse(BaseModel):
    id: int
    document_id: int
    version: int
    content: str
    author: UserBrief
    change_summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentVersionBrief(BaseModel):
    id: int
    version: int
    author: UserBrief
    change_summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EditOperation(BaseModel):
    type: str
    position: int
    text: Optional[str] = None
    length: Optional[int] = None
    base_version: int


class ConvertTaskResponse(BaseModel):
    id: int
    document_id: int
    status: ConvertTaskStatus
    progress: int
    preview_name: Optional[str] = None
    preview_type: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdfSearchResult(BaseModel):
    page: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


class PdfSearchResponse(BaseModel):
    query: str
    total_matches: int
    results: List[PdfSearchResult]


class ServiceMetrics(BaseModel):
    uptime_seconds: float
    total_requests: int
    total_conversions: int
    successful_conversions: int
    failed_conversions: int
    avg_conversion_seconds: Optional[float] = None
    slow_requests: int
