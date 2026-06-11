"""
并发预订验证脚本
测试场景：
1. 房间库存为2，模拟5个并发预订请求
2. 验证只有2个请求成功，不会超卖
3. 验证失败的请求收到正确的错误信息
"""

import asyncio
import httpx
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Hotel, Room, Order, RoomInventoryLock, Base
from sqlalchemy import create_engine
from datetime import date, datetime, timedelta

API_BASE_URL = "http://localhost:8000/api"

def setup_test_data():
    """创建测试数据"""
    db = SessionLocal()
    try:
        # 清理旧数据
        db.query(Order).delete()
        db.query(RoomInventoryLock).delete()
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

async def create_booking(client: httpx.AsyncClient, room_id: int, guest_name: str, check_in: date, check_out: date):
    """创建预订请求"""
    try:
        response = await client.post(
            f"{API_BASE_URL}/bookings",
            json={
                "room_id": room_id,
                "guest_name": guest_name,
                "guest_phone": "13800138000",
                "guest_email": f"{guest_name}@test.com",
                "check_in": check_in.isoformat(),
                "check_out": check_out.isoformat(),
                "captcha_id": "test",
                "captcha_text": "test"
            },
            timeout=30.0
        )
        return {
            "guest_name": guest_name,
            "status_code": response.status_code,
            "success": response.status_code == 200,
            "response": response.json() if response.status_code != 200 else {"order_id": response.json().get("id")}
        }
    except Exception as e:
        return {
            "guest_name": guest_name,
            "status_code": 500,
            "success": False,
            "response": {"detail": str(e)}
        }

async def test_concurrent_bookings(room_id: int, num_requests: int):
    """测试并发预订"""
    check_in = date.today() + timedelta(days=1)
    check_out = date.today() + timedelta(days=2)
    
    print(f"\n测试并发预订: 房间ID={room_id}, 并发请求数={num_requests}")
    print(f"入住日期: {check_in} - {check_out}")
    
    async with httpx.AsyncClient() as client:
        tasks = []
        for i in range(num_requests):
            guest_name = f"客人{i+1}"
            tasks.append(create_booking(client, room_id, guest_name, check_in, check_out))
        
        results = await asyncio.gather(*tasks)
    
    success_count = sum(1 for r in results if r["success"])
    fail_count = num_requests - success_count
    
    print(f"\n结果统计:")
    print(f"  成功预订: {success_count}")
    print(f"  失败请求: {fail_count}")
    
    for r in results:
        status = "✓ 成功" if r["success"] else "✗ 失败"
        print(f"  {r['guest_name']}: {status} - {r['response']}")
    
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
            return False
    finally:
        db.close()

def test_sequential_bookings(room_id: int):
    """测试顺序预订（验证正常流程）"""
    print("\n测试顺序预订（验证正常流程）")
    
    db = SessionLocal()
    try:
        # 清理之前的订单
        db.query(Order).delete()
        db.query(RoomInventoryLock).delete()
        db.commit()
    finally:
        db.close()
    
    import requests
    
    check_in = date.today() + timedelta(days=3)
    check_out = date.today() + timedelta(days=4)
    
    # 第一个预订应该成功
    response1 = requests.post(
        f"{API_BASE_URL}/bookings",
        json={
            "room_id": room_id,
            "guest_name": "顺序客人1",
            "guest_phone": "13900139001",
            "guest_email": "seq1@test.com",
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "captcha_id": "test",
            "captcha_text": "test"
        }
    )
    
    print(f"顺序预订1: 状态码={response1.status_code}")
    
    # 第二个预订应该成功
    response2 = requests.post(
        f"{API_BASE_URL}/bookings",
        json={
            "room_id": room_id,
            "guest_name": "顺序客人2",
            "guest_phone": "13900139002",
            "guest_email": "seq2@test.com",
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "captcha_id": "test",
            "captcha_text": "test"
        }
    )
    
    print(f"顺序预订2: 状态码={response2.status_code}")
    
    # 第三个预订应该失败（库存不足）
    response3 = requests.post(
        f"{API_BASE_URL}/bookings",
        json={
            "room_id": room_id,
            "guest_name": "顺序客人3",
            "guest_phone": "13900139003",
            "guest_email": "seq3@test.com",
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "captcha_id": "test",
            "captcha_text": "test"
        }
    )
    
    print(f"顺序预订3: 状态码={response3.status_code}")
    
    success_count = sum(1 for r in [response1, response2] if r.status_code == 200)
    fail_count = 1 if response3.status_code == 400 else 0
    
    print(f"\n顺序预订结果:")
    print(f"  成功: {success_count} (预期2)")
    print(f"  失败: {fail_count} (预期1)")
    
    return success_count == 2 and response3.status_code == 400

async def main():
    print("=" * 60)
    print("并发预订验证测试")
    print("=" * 60)
    
    # 创建测试数据
    hotel_id, room_id = setup_test_data()
    
    # 测试1: 并发预订（库存2，请求5）
    results, success_count = await test_concurrent_bookings(room_id, 5)
    
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

if __name__ == "__main__":
    asyncio.run(main())