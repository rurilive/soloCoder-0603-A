from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class RoleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=255)


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=255)


class PermissionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    codename: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)


class PermissionCreate(PermissionBase):
    pass


class PermissionResponse(PermissionBase):
    id: int

    class Config:
        from_attributes = True


class RoleResponse(RoleBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RoleWithPermissionsResponse(RoleBase):
    id: int
    created_at: datetime
    permissions: List[PermissionResponse] = []

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: str = Field(..., max_length=255)
    full_name: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = True
    avatar: Optional[str] = Field(None, max_length=500)
    language_preference: Optional[str] = Field("zh", max_length=10)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=255)
    role_ids: Optional[List[int]] = []


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    avatar: Optional[str] = Field(None, max_length=500)
    language_preference: Optional[str] = Field(None, max_length=10)
    password: Optional[str] = Field(None, min_length=6, max_length=255)


class UserRolesUpdate(BaseModel):
    role_ids: List[int]


class UserResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    roles: List[RoleResponse] = []

    class Config:
        from_attributes = True


class UserWithPermissionsResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    roles: List[RoleResponse] = []
    permissions: List[PermissionResponse] = []


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserWithPermissionsResponse
    roles: List[str]


class AssignRoleRequest(BaseModel):
    role_ids: List[int]


class RolePermissionsUpdate(BaseModel):
    permission_ids: List[int]


TRANSLATION_TASK_STATUS = [
    "pending",
    "assigned",
    "in_progress",
    "completed",
    "reviewing",
    "approved",
    "rejected",
]

TRANSLATION_TASK_PRIORITY = ["low", "normal", "high", "urgent"]

REVIEW_STATUS = ["pending", "approved", "rejected"]


class TranslationTaskBase(BaseModel):
    entry_id: int
    source_language: str = Field(..., min_length=1, max_length=10)
    target_language: str = Field(..., min_length=1, max_length=10)
    priority: Optional[str] = "normal"
    deadline: Optional[datetime] = None
    description: Optional[str] = None


class TranslationTaskCreate(TranslationTaskBase):
    target_languages: Optional[List[str]] = None


class TranslationTaskUpdate(BaseModel):
    priority: Optional[str] = None
    deadline: Optional[datetime] = None
    description: Optional[str] = None
    progress: Optional[int] = Field(None, ge=0, le=100)
    translated_field_values: Optional[Dict[str, Any]] = None


class TranslationTaskAssign(BaseModel):
    assignee_id: int


class TranslationTaskStatusUpdate(BaseModel):
    status: str
    comment: Optional[str] = None


class TranslationTaskHistoryResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    action: str
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    comment: Optional[str] = None
    changes: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True


class TranslationReviewBase(BaseModel):
    status: str = "pending"
    comment: Optional[str] = None
    reviewed_field_values: Optional[Dict[str, Any]] = {}


class TranslationReviewCreate(TranslationReviewBase):
    task_id: int
    reviewer_id: int


class TranslationReviewUpdate(BaseModel):
    status: Optional[str] = None
    comment: Optional[str] = None
    reviewed_field_values: Optional[Dict[str, Any]] = None


class TranslationReviewResponse(BaseModel):
    id: int
    task_id: int
    reviewer_id: int
    status: str
    comment: Optional[str] = None
    reviewed_field_values: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TranslationCommentBase(BaseModel):
    content: str
    field_name: Optional[str] = None


class TranslationCommentCreate(TranslationCommentBase):
    task_id: int


class TranslationCommentResponse(TranslationCommentBase):
    id: int
    task_id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TranslationTaskSimpleResponse(BaseModel):
    id: int
    entry_id: int
    source_language: str
    target_language: str
    status: str
    priority: str
    progress: int
    deadline: Optional[datetime] = None
    created_by_id: int
    assignee_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TranslationTaskResponse(TranslationTaskBase):
    id: int
    status: str
    progress: int
    source_field_values: Dict[str, Any] = {}
    translated_field_values: Dict[str, Any] = {}
    created_by_id: int
    assignee_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TranslationTaskDetailResponse(TranslationTaskResponse):
    created_by: Optional[UserResponse] = None
    assignee: Optional[UserResponse] = None
    reviews: List[TranslationReviewResponse] = []
    comments: List[TranslationCommentResponse] = []
    history: List[TranslationTaskHistoryResponse] = []


class TranslationTaskStats(BaseModel):
    total: int = 0
    pending: int = 0
    assigned: int = 0
    in_progress: int = 0
    completed: int = 0
    reviewing: int = 0
    approved: int = 0
    rejected: int = 0
