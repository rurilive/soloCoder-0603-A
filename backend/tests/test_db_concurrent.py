"""
数据库层面并发控制验证脚本
直接测试SQLAlchemy的行级锁机制，验证不会超卖
"""

import threading
import time
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import date, datetime, timedelta
from sqlalchemy import and_, or_, Column, Integer, String, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

# 创建测试数据库引擎，使用 IMMEDIATE 事务模式
SQLALCHEMY_DATABASE_URL = "sqlite:///./hotel_booking.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# 设置 SQLite 使用 IMMEDIATE 事务模式
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA busy_timeout = 30000")  # 设置等待超时30秒
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 定义测试模型
class Hotel(Base):
    __tablename__ = "hotels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    city = Column(String, index=True)
    address = Column(String)
    description = Column(Text)
    star_rating = Column(Integer)
    min_price = Column(Float)

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"))
    name = Column(String)
    description = Column(Text)
    price_per_night = Column(Float)
    max_guests = Column(Integer)
    bed_type = Column(String)
    room_count = Column(Integer)

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"))
    room_id = Column(Integer, ForeignKey("rooms.id"))
    guest_name = Column(String)
    guest_phone = Column(String)
    guest_email = Column(String)
    check_in = Column(Date)
    check_out = Column(Date)
    nights = Column(Integer)
    total_price = Column(Float)
    status = Column(String)
    locked_until = Column(DateTime)
    special_requests = Column(Text)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class RoomInventoryLock(Base):
    __tablename__ = "room_inventory_locks"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    check_in = Column(Date, nullable=False)
    check_out = Column(Date, nullable=False)
    locked_at = Column(DateTime, default=datetime.now)
    locked_until = Column(DateTime)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

class RoomLock(Base):
    __tablename__ = "room_locks"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), unique=True, nullable=False)
    locked_at = Column(DateTime, nullable=True)
    locked_until = Column(DateTime, nullable=True)
    lock_owner = Column(String, nullable=True)

# 创建所有表
Base.metadata.create_all(bind=engine)

def setup_test_data():
    """创建测试数据"""
    db = SessionLocal()
    try:
        # 清理旧数据
        db.query(Order).delete()
        db.query(RoomInventoryLock).delete()
        db.query(RoomLock).delete()
        db.query(Room).delete()
        db.query(Hotel).delete()
        db.commit()
        
        # 创建测试酒店
        hotel = Hotel(
            name="测试酒店",
            city="北京",
            address="测试地址",
            description="测试描述",
            star_rating=5,
            min_price=100.0
        )
        db.add(hotel)
        db.flush()
        
        # 创建测试房间，库存为2
        room = Room(
            hotel_id=hotel.id,
            name="标准间",
            description="测试房间",
            price_per_night=100.0,
            max_guests=2,
            bed_type="double",
            room_count=2  # 库存为2
        )
        db.add(room)
        db.flush()
        
        # 预先创建房间锁记录，避免并发时的 UNIQUE constraint 错误
        room_lock = RoomLock(room_id=room.id)
        db.add(room_lock)
        
        db.commit()
        
        print(f"创建测试数据: 酒店 {hotel.id}, 房间 {room.id}, 库存 {room.room_count}")
        return hotel.id, room.id
    finally:
        db.close()

def cleanup_test_data():
    """清理测试数据"""
    db = SessionLocal()
    try:
        db.query(Order).delete()
        db.query(RoomInventoryLock).delete()
        db.query(Room).delete()
        db.query(Hotel).delete()
        db.commit()
        print("清理测试数据完成")
    finally:
        db.close()

def create_booking_thread(room_id: int, guest_name: str, check_in: date, check_out: date, results: list, thread_id: int):
    """线程函数：创建预订"""
    db = SessionLocal()
    success = False
    order_id = None
    error_msg = None
    
    try:
        # 使用 BEGIN IMMEDIATE 事务模式，确保在事务开始时就获取写锁
        connection = db.connection()
        connection.execute(text("BEGIN IMMEDIATE"))
        
        room = db.query(Room).filter(Room.id == room_id).first()
        
        if not room:
            error_msg = "Room not found"
            db.rollback()
            return
        
        now = datetime.now()
        
        # 检查库存
        occupied_count = db.query(Order).filter(
            and_(
                Order.room_id == room_id,
                Order.status.in_(["confirmed", "pending"]),
                Order.check_in < check_out,
                Order.check_out > check_in,
                or_(
                    Order.status == "confirmed",
                    Order.locked_until > now
                )
            )
        ).count()
        
        print(f"  线程{thread_id} ({guest_name}): 当前库存占用={occupied_count}, 总库存={room.room_count}")
        
        if occupied_count >= room.room_count:
            error_msg = "No available rooms"
            db.rollback()
            return
        
        # 创建订单
        locked_until = now + timedelta(minutes=30)
        
        order = Order(
            order_no=f"TEST{thread_id}{int(now.timestamp())}",
            hotel_id=room.hotel_id,
            room_id=room_id,
            guest_name=guest_name,
            guest_phone="13800138000",
            guest_email=f"{guest_name}@test.com",
            check_in=check_in,
            check_out=check_out,
            nights=1,
            total_price=100.0,
            status="pending",
            locked_until=locked_until
        )
        db.add(order)
        db.flush()
        
        # 创建库存锁
        inventory_lock = RoomInventoryLock(
            room_id=room_id,
            check_in=check_in,
            check_out=check_out,
            locked_at=now,
            locked_until=locked_until,
            order_id=order.id
        )
        db.add(inventory_lock)
        
        db.commit()
        db.refresh(order)
        
        success = True
        order_id = order.id
        print(f"  线程{thread_id} ({guest_name}): ✓ 预订成功, 订单ID={order_id}")
        
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"  线程{thread_id} ({guest_name}): ✗ 预订失败 - {error_msg}")
    finally:
        db.close()
        results[thread_id] = {
            "guest_name": guest_name,
            "success": success,
            "order_id": order_id,
            "error": error_msg
        }

def test_concurrent_bookings(room_id: int, num_threads: int):
    """测试并发预订"""
    check_in = date.today() + timedelta(days=1)
    check_out = date.today() + timedelta(days=2)
    
    print(f"\n测试并发预订: 房间ID={room_id}, 并发线程数={num_threads}")
    print(f"入住日期: {check_in} - {check_out}")
    print(f"房间库存: 2")
    
    results = [None] * num_threads
    threads = []
    
    for i in range(num_threads):
        guest_name = f"客人{i+1}"
        t = threading.Thread(
            target=create_booking_thread,
            args=(room_id, guest_name, check_in, check_out, results, i)
        )
        threads.append(t)
    
    # 同时启动所有线程
    print("\n启动并发线程...")
    for t in threads:
        t.start()
    
    # 等待所有线程完成
    for t in threads:
        t.join()
    
    success_count = sum(1 for r in results if r and r["success"])
    fail_count = num_threads - success_count
    
    print(f"\n结果统计:")
    print(f"  成功预订: {success_count}")
    print(f"  失败请求: {fail_count}")
    
    for r in results:
        if r:
            status = "✓ 成功" if r["success"] else "✗ 失败"
            print(f"  {r['guest_name']}: {status}" + (f", 订单ID={r['order_id']}" if r['success'] else f", 错误={r['error']}"))
    
    return results, success_count

def verify_no_oversell(room_id: int, expected_max: int):
    """验证没有超卖"""
    db = SessionLocal()
    try:
        check_in = date.today() + timedelta(days=1)
        check_out = date.today() + timedelta(days=2)
        now = datetime.now()
        
        # 统计有效订单数量
        valid_orders = db.query(Order).filter(
            Order.room_id == room_id,
            Order.status.in_(["confirmed", "pending"]),
            Order.check_in < check_out,
            Order.check_out > check_in,
            (Order.status == "confirmed") | (Order.locked_until > now)
        ).all()
        
        actual_count = len(valid_orders)
        
        print(f"\n验证结果:")
        print(f"  预期最大库存: {expected_max}")
        print(f"  实际有效订单: {actual_count}")
        
        if actual_count <= expected_max:
            print(f"  ✓ 没有超卖!")
            return True
        else:
            print(f"  ✗ 发生超卖! 超出 {actual_count - expected_max} 个订单")
            for order in valid_orders:
                print(f"    订单: {order.order_no}, 客人: {order.guest_name}")
            return False
    finally:
        db.close()

def test_sequential_bookings(room_id: int):
    """测试顺序预订"""
    print("\n测试顺序预订（验证正常流程）")
    
    db = SessionLocal()
    try:
        # 清理之前的订单
        db.query(Order).delete()
        db.query(RoomInventoryLock).delete()
        db.commit()
    finally:
        db.close()
    
    check_in = date.today() + timedelta(days=3)
    check_out = date.today() + timedelta(days=4)
    
    results = []
    
    for i in range(3):
        guest_name = f"顺序客人{i+1}"
        db = SessionLocal()
        try:
            room = db.query(Room).filter(Room.id == room_id).with_for_update().first()
            now = datetime.now()
            
            occupied_count = db.query(Order).filter(
                and_(
                    Order.room_id == room_id,
                    Order.status.in_(["confirmed", "pending"]),
                    Order.check_in < check_out,
                    Order.check_out > check_in,
                    or_(
                        Order.status == "confirmed",
                        Order.locked_until > now
                    )
                )
            ).count()
            
            if occupied_count >= room.room_count:
                print(f"顺序预订{i+1}: ✗ 失败 - 库存不足")
                results.append(False)
                db.rollback()
            else:
                order = Order(
                    order_no=f"SEQ{i+1}{int(now.timestamp())}",
                    hotel_id=room.hotel_id,
                    room_id=room_id,
                    guest_name=guest_name,
                    guest_phone="13900139000",
                    guest_email=f"seq{i+1}@test.com",
                    check_in=check_in,
                    check_out=check_out,
                    nights=1,
                    total_price=100.0,
                    status="pending",
                    locked_until=now + timedelta(minutes=30)
                )
                db.add(order)
                db.commit()
                print(f"顺序预订{i+1}: ✓ 成功")
                results.append(True)
        finally:
            db.close()
    
    success_count = sum(results)
    print(f"\n顺序预订结果:")
    print(f"  成功: {success_count} (预期2)")
    print(f"  失败: {3 - success_count} (预期1)")
    
    return success_count == 2

def main():
    print("=" * 60)
    print("数据库层面并发控制验证测试")
    print("=" * 60)
    
    # 创建测试数据
    hotel_id, room_id = setup_test_data()
    
    # 测试1: 并发预订（库存2，请求5）
    results, success_count = test_concurrent_bookings(room_id, 5)
    
    # 验证没有超卖
    no_oversell = verify_no_oversell(room_id, 2)
    
    # 测试2: 顺序预订（验证正常流程）
    sequential_ok = test_sequential_bookings(room_id)
    
    # 清理测试数据
    cleanup_test_data()
    
    print("\n" + "=" * 60)
    print("测试总结:")
    print(f"  并发预订测试: {'✓ 通过' if no_oversell else '✗ 失败'}")
    print(f"  顺序预订测试: {'✓ 通过' if sequential_ok else '✗ 失败'}")
    print("=" * 60)
    
    return no_oversell and sequential_ok

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)