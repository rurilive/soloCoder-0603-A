from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    is_organizer: Optional[bool] = False

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    is_organizer: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    location: str
    max_capacity: int
    registration_form: Optional[List[Dict[str, Any]]] = None

class EventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    location: str
    max_capacity: int
    registration_form: Optional[List[Dict[str, Any]]]
    status: str
    organizer_id: int
    created_at: datetime
    updated_at: datetime
    registered_count: int
    
    class Config:
        from_attributes = True

class RegistrationCreate(BaseModel):
    event_id: int
    form_data: Optional[Dict[str, Any]] = None

class RegistrationResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    ticket_code: str
    check_in: bool
    check_in_time: Optional[datetime]
    form_data: Optional[Dict[str, Any]]
    created_at: datetime
    
    class Config:
        from_attributes = True

class CheckInRequest(BaseModel):
    ticket_code: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse