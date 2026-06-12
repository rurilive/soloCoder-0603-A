from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from ..schemas import DeviceCreate, DeviceResponse, CheckInRecordResponse, CheckInStatistics
from ..models import Device, CheckInRecord, Registration, Event, User
from ..database import get_db
from ..dependencies import get_current_organizer

router = APIRouter(prefix="/devices", tags=["devices"])

@router.post("/", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    device: DeviceCreate,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == device.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to manage devices for this event")
    
    existing_device = db.query(Device).filter(Device.device_id == device.device_id).first()
    if existing_device:
        raise HTTPException(status_code=400, detail="Device ID already exists")
    
    new_device = Device(
        device_id=device.device_id,
        name=device.name,
        entrance=device.entrance,
        event_id=device.event_id,
        is_active=True
    )
    
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    return new_device

@router.get("/event/{event_id}", response_model=list[DeviceResponse])
def get_event_devices(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to view devices for this event")
    
    devices = db.query(Device).filter(Device.event_id == event_id, Device.is_active == True).all()
    return devices

@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(
    device_id: int,
    device: DeviceCreate,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    existing_device = db.query(Device).filter(Device.id == device_id).first()
    if not existing_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    event = db.query(Event).filter(Event.id == existing_device.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this device")
    
    if device.device_id != existing_device.device_id:
        duplicate = db.query(Device).filter(Device.device_id == device.device_id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Device ID already exists")
        existing_device.device_id = device.device_id
    
    existing_device.name = device.name
    existing_device.entrance = device.entrance
    
    db.commit()
    db.refresh(existing_device)
    return existing_device

@router.delete("/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    event = db.query(Event).filter(Event.id == device.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this device")
    
    device.is_active = False
    db.commit()
    
    return {"message": "Device deactivated successfully"}

@router.get("/event/{event_id}/checkin-statistics", response_model=CheckInStatistics)
def get_checkin_statistics(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to view statistics for this event")
    
    total_checkins = db.query(CheckInRecord).filter(CheckInRecord.event_id == event_id).count()
    
    entrance_stats = db.query(
        CheckInRecord.entrance,
        func.count(CheckInRecord.id).label('count')
    ).filter(CheckInRecord.event_id == event_id).group_by(CheckInRecord.entrance).all()
    
    entrance_counts = {entrance: count for entrance, count in entrance_stats}
    
    return {
        "event_id": event_id,
        "event_title": event.title,
        "total_checkins": total_checkins,
        "entrance_counts": entrance_counts
    }

@router.get("/event/{event_id}/checkin-records", response_model=list[CheckInRecordResponse])
def get_checkin_records(
    event_id: int,
    db: Session = Depends(get_db),
    organizer: User = Depends(get_current_organizer)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.organizer_id != organizer.id:
        raise HTTPException(status_code=403, detail="Not authorized to view check-in records for this event")
    
    records = db.query(CheckInRecord).filter(
        CheckInRecord.event_id == event_id
    ).order_by(CheckInRecord.check_in_time.desc()).all()
    
    return records