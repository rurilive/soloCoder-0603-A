from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Order
from ..schemas import Order as OrderSchema, OrderStatusUpdate

router = APIRouter()

@router.get("/orders", response_model=List[OrderSchema])
def get_orders(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(None),
    hotel_id: Optional[int] = Query(None),
    guest_name: Optional[str] = Query(None),
    page: int = Query(1),
    limit: int = Query(10)
):
    query = db.query(Order)
    
    if status:
        query = query.filter(Order.status == status)
    if hotel_id:
        query = query.filter(Order.hotel_id == hotel_id)
    if guest_name:
        query = query.filter(Order.guest_name.ilike(f"%{guest_name}%"))
    
    query = query.order_by(Order.created_at.desc())
    offset = (page - 1) * limit
    orders = query.offset(offset).limit(limit).all()
    return orders

@router.get("/orders/{order_id}", response_model=OrderSchema)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/orders/{order_id}/status", response_model=OrderSchema)
def update_order_status(order_id: int, update: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    valid_statuses = ["pending", "confirmed", "cancelled", "completed"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    order.status = update.status
    
    if update.status == "cancelled":
        order.locked_until = None
    
    if update.status == "confirmed":
        order.locked_until = None
    
    db.commit()
    db.refresh(order)
    return order