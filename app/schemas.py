from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

from app.models import UserRole, DocumentStatus, PermissionLevel


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
