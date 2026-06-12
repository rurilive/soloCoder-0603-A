import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from ..schemas import RegistrationCreate, RegistrationResponse, WaitlistResponse, EventWithWaitlistResponse
from ..models import Registration, Event, User
from ..database import get_db
from ..dependencies import get_current_user, get_current_organizer
from ..utils import generate_ticket_code, generate_qr_code, send_waitlist_notification_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/registrations", tags=["registrations"])

@router.get("/", response_model=list[RegistrationResponse])
def get_user_registrations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    registrations = db.query(Registration).filter(Registration.user_id == user.id).all()
    return registrations

@router.post("/", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
def register_for_event(
    registration: RegistrationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == registration.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    existing_registration = db.query(Registration).filter(
        Registration.user_id == user.id,
        Registration.event_id == registration.event_id
    ).first()
    if existing_registration:
        if existing_registration.status == "waitlisted":
            raise HTTPException(status_code=400, detail="Already on the waitlist for this event")
        else:
            raise HTTPException(status_code=400, detail="Already registered for this event")
    
    confirmed_count = db.query(Registration).filter(
        Registration.event_id == registration.event_id,
        Registration.status == "confirmed"
    ).count()
    
    if confirmed_count >= event.max_capacity:
        waitlist_position = db.query(func.max(Registration.waitlist_position)).filter(
            Registration.event_id == registration.event_id,
            Registration.status == "waitlisted"
        ).scalar() or 0
        
        new_registration = Registration(
            user_id=user.id,
            event_id=registration.event_id,
            ticket_code=None,
            form_data=registration.form_data,
            status="waitlisted",
            waitlist_position=waitlist_position + 1
        )
        
        db.add(new_registration)
        db.commit()
        db.refresh(new_registration)
        return new_registration
    
    ticket_code = generate_ticket_code()
    new_registration = Registration(
        user_id=user.id,
        event_id=registration.event_id,
        ticket_code=ticket_code,
        form_data=registration.form_data,
        status="confirmed",
        waitlist_position=None
    )
    
    db.add(new_registration)
    db.commit()
    db.refresh(new_registration)
    return new_registration

@router.get("/{registration_id}/qr-code")
def get_ticket_qr_code(
    registration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    if registration.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this ticket")
    
    qr_data = f"event://checkin/{registration.ticket_code}"
    qr_base64 = generate_qr_code(qr_data)
    
    return {
        "ticket_code": registration.ticket_code,
        "qr_code_base64": qr_base64,
        "event_id": registration.event_id
    }

@router.post("/checkin")
def check_in(
    check_in_request: dict,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    ticket_code = check_in_request.get("ticket_code")
    if not ticket_code:
        raise HTTPException(status_code=400, detail="Ticket code is required")
    
    registration = db.query(Registration).filter(Registration.ticket_code == ticket_code).first()
    if not registration:
        raise HTTPException(status_code=404, detail="Invalid ticket code")
    
    # 验证主办方权限：只有该活动的主办方才能签到
    event = db.query(Event).filter(Event.id == registration.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to check in for this event")
    
    if registration.check_in:
        raise HTTPException(status_code=400, detail="Already checked in")
    
    registration.check_in = True
    registration.check_in_time = datetime.utcnow()
    db.commit()
    db.refresh(registration)
    
    return {
        "message": "Check-in successful",
        "registration": registration
    }

@router.get("/event/{event_id}", response_model=list[RegistrationResponse])
def get_event_registrations(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    # 验证活动是否存在
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # 验证主办方权限：只有该活动的主办方才能查看报名数据
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to view registrations for this event")
    
    registrations = db.query(Registration).filter(Registration.event_id == event_id).all()
    return registrations

@router.delete("/{registration_id}")
def cancel_registration(
    registration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    if registration.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this registration")
    
    event = db.query(Event).filter(Event.id == registration.event_id).with_for_update().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    was_confirmed = registration.status == "confirmed"
    
    try:
        if was_confirmed:
            waitlisted_users = db.query(Registration).filter(
                Registration.event_id == event.id,
                Registration.status == "waitlisted"
            ).order_by(Registration.waitlist_position).with_for_update().all()
            
            current_confirmed_count = db.query(Registration).filter(
                Registration.event_id == event.id,
                Registration.status == "confirmed"
            ).count()
            
            db.delete(registration)
            
            current_confirmed_count -= 1
            
            if waitlisted_users and current_confirmed_count < event.max_capacity:
                next_waitlisted = waitlisted_users[0]
                original_position = next_waitlisted.waitlist_position
                
                db.query(Registration).filter(
                    Registration.event_id == event.id,
                    Registration.status == "waitlisted",
                    Registration.waitlist_position > original_position
                ).update({"waitlist_position": Registration.waitlist_position - 1})
                
                next_waitlisted.status = "confirmed"
                next_waitlisted.ticket_code = generate_ticket_code()
                next_waitlisted.waitlist_position = None
                
                db.commit()
                
                waitlisted_user = db.query(User).filter(User.id == next_waitlisted.user_id).first()
                if waitlisted_user:
                    email_result = send_waitlist_notification_email(waitlisted_user.email, event.title)
                    if not email_result.get("success"):
                        logger.warning(f"Failed to send waitlist notification email: {email_result.get('message')}")
            else:
                db.commit()
        else:
            db.delete(registration)
            db.commit()
        
        return {"message": "Registration cancelled successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to cancel registration: {str(e)}")

@router.get("/event/{event_id}/waitlist", response_model=list[WaitlistResponse])
def get_event_waitlist(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to view waitlist for this event")
    
    waitlist = db.query(Registration).filter(
        Registration.event_id == event_id,
        Registration.status == "waitlisted"
    ).order_by(Registration.waitlist_position).all()
    
    return [{
        "registration_id": r.id,
        "event_id": r.event_id,
        "user_id": r.user_id,
        "waitlist_position": r.waitlist_position,
        "status": r.status,
        "created_at": r.created_at
    } for r in waitlist]

@router.get("/{registration_id}/waitlist-position")
def get_user_waitlist_position(
    registration_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    if registration.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this registration")
    
    if registration.status != "waitlisted":
        raise HTTPException(status_code=400, detail="Registration is not on waitlist")
    
    return {
        "registration_id": registration.id,
        "event_id": registration.event_id,
        "waitlist_position": registration.waitlist_position
    }