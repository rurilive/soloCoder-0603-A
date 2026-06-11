from sqlalchemy.orm import Session
from datetime import datetime
from .database import SessionLocal
from .models import Order, RoomInventoryLock

def release_expired_locks():
    db: Session = SessionLocal()
    try:
        now = datetime.now()
        
        expired_orders = db.query(Order).filter(
            Order.status == "pending",
            Order.locked_until.isnot(None),
            Order.locked_until < now
        ).all()
        
        for order in expired_orders:
            order.status = "cancelled"
            order.locked_until = None
        
        expired_locks = db.query(RoomInventoryLock).filter(
            RoomInventoryLock.locked_until < now
        ).all()
        
        lock_count = len(expired_locks)
        for lock in expired_locks:
            db.delete(lock)
        
        db.commit()
        
        order_count = len(expired_orders)
        if order_count > 0 or lock_count > 0:
            print(f"Released {order_count} expired orders and {lock_count} expired inventory locks")
        return order_count + lock_count
    finally:
        db.close()

if __name__ == "__main__":
    release_expired_locks()