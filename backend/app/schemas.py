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
    ticket_code: Optional[str]
    check_in: bool
    check_in_time: Optional[datetime]
    form_data: Optional[Dict[str, Any]]
    created_at: datetime
    status: str
    waitlist_position: Optional[int]
    waitlist_offer_sent_at: Optional[datetime]
    waitlist_offer_token: Optional[str]
    waitlist_confirmed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class WaitlistConfirmRequest(BaseModel):
    token: str
    accept: bool

class WaitlistConfirmResponse(BaseModel):
    success: bool
    message: str
    registration: Optional[RegistrationResponse]
    
    class Config:
        from_attributes = True

class WaitlistResponse(BaseModel):
    registration_id: int
    event_id: int
    user_id: int
    waitlist_position: int
    status: str
    created_at: datetime

class EventWithWaitlistResponse(BaseModel):
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
    waitlist_count: int
    
    class Config:
        from_attributes = True

class CheckInRequest(BaseModel):
    ticket_code: str
    device_id: Optional[str] = None

class DeviceCreate(BaseModel):
    device_id: str
    name: str
    entrance: str
    event_id: int

class DeviceResponse(BaseModel):
    id: int
    device_id: str
    name: str
    entrance: str
    event_id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class CheckInRecordResponse(BaseModel):
    id: int
    registration_id: int
    device_id: Optional[int]
    event_id: int
    entrance: str
    check_in_time: datetime
    
    class Config:
        from_attributes = True

class CheckInStatistics(BaseModel):
    event_id: int
    event_title: str
    total_checkins: int
    entrance_counts: Dict[str, int]

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse