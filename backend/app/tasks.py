from sqlalchemy.orm import Session
from datetime import datetime
from .database import SessionLocal
from .models import Order

def release_expired_locks():
    db: Session = SessionLocal()
    try:
        expired_orders = db.query(Order).filter(
            Order.status == "pending",
            Order.locked_until.isnot(None),
            Order.locked_until < datetime.now()
        ).all()
        
        for order in expired_orders:
            order.status = "cancelled"
            order.locked_until = None
        
        db.commit()
        count = len(expired_orders)
        if count > 0:
            print(f"Released {count} expired locked orders")
        return count
    finally:
        db.close()

if __name__ == "__main__":
    release_expired_locks()