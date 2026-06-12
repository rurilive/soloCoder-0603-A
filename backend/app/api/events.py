from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from ..schemas import EventCreate, EventResponse, EventWithWaitlistResponse
from ..models import Event, Registration
from ..database import get_db
from ..dependencies import get_current_organizer, get_current_user
from ..models import User

router = APIRouter(prefix="/events", tags=["events"])

@router.get("/", response_model=list[EventResponse])
def get_events(db: Session = Depends(get_db)):
    events = db.query(Event).all()
    result = []
    for event in events:
        registered_count = db.query(Registration).filter(Registration.event_id == event.id).count()
        event_data = event.__dict__.copy()
        event_data["registered_count"] = registered_count
        result.append(event_data)
    return result

@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    registered_count = db.query(Registration).filter(Registration.event_id == event.id).count()
    event_data = event.__dict__.copy()
    event_data["registered_count"] = registered_count
    return event_data

@router.get("/{event_id}/detail", response_model=EventWithWaitlistResponse)
def get_event_with_waitlist(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    registered_count = db.query(Registration).filter(
        Registration.event_id == event.id,
        Registration.status == "confirmed"
    ).count()
    
    waitlist_count = db.query(Registration).filter(
        Registration.event_id == event.id,
        Registration.status == "waitlisted"
    ).count()
    
    event_data = event.__dict__.copy()
    event_data["registered_count"] = registered_count
    event_data["waitlist_count"] = waitlist_count
    
    return event_data

@router.post("/", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    new_event = Event(
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        location=event.location,
        max_capacity=event.max_capacity,
        registration_form=event.registration_form,
        organizer_id=organizer.id
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    new_event_data = new_event.__dict__.copy()
    new_event_data["registered_count"] = 0
    return new_event_data

@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    event: EventCreate,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    existing_event = db.query(Event).filter(Event.id == event_id).first()
    if not existing_event:
        raise HTTPException(status_code=404, detail="Event not found")
    if existing_event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")
    
    existing_event.title = event.title
    existing_event.description = event.description
    existing_event.start_time = event.start_time
    existing_event.end_time = event.end_time
    existing_event.location = event.location
    existing_event.max_capacity = event.max_capacity
    existing_event.registration_form = event.registration_form
    existing_event.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(existing_event)
    existing_event_data = existing_event.__dict__.copy()
    existing_event_data["registered_count"] = db.query(Registration).filter(Registration.event_id == event_id).count()
    return existing_event_data

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")
    
    db.delete(event)
    db.commit()
    return None