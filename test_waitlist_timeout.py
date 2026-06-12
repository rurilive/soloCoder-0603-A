import requests
import json
import time

BASE_URL = "http://localhost:1111"

def register_user(email, password, is_organizer=False):
    response = requests.post(
        f"{BASE_URL}/users/register",
        json={"username": email.split('@')[0], "email": email, "password": password, "is_organizer": is_organizer}
    )
    print(f"Register {email}: {response.status_code}")
    return response.json()

def login_user(email, password):
    response = requests.post(
        f"{BASE_URL}/users/login",
        json={"email": email, "password": password}
    )
    print(f"Login {email}: {response.status_code}")
    return response.json()

def create_event(token, title, max_capacity=2):
    response = requests.post(
        f"{BASE_URL}/events",
        json={
            "title": title,
            "description": "Test event",
            "start_time": "2026-12-31T20:00:00",
            "end_time": "2026-12-31T22:00:00",
            "location": "Test Location",
            "max_capacity": max_capacity
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Create event: {response.status_code}")
    return response.json()

def register_for_event(token, event_id):
    response = requests.post(
        f"{BASE_URL}/registrations",
        json={"event_id": event_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Register for event {event_id}: {response.status_code}")
    return response.json()

def cancel_registration(token, registration_id):
    response = requests.delete(
        f"{BASE_URL}/registrations/{registration_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Cancel registration {registration_id}: {response.status_code}")
    return response.json()

def get_registrations(token):
    response = requests.get(
        f"{BASE_URL}/registrations",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"Get registrations: {response.status_code}")
    return response.json()

def get_waitlist(event_id, organizer_token):
    response = requests.get(
        f"{BASE_URL}/registrations/event/{event_id}/waitlist",
        headers={"Authorization": f"Bearer {organizer_token}"}
    )
    print(f"Get waitlist for event {event_id}: {response.status_code}")
    return response.json()

def confirm_waitlist_offer(token, accept=True):
    response = requests.post(
        f"{BASE_URL}/registrations/waitlist/confirm",
        json={"token": token, "accept": accept}
    )
    print(f"Confirm waitlist offer (accept={accept}): {response.status_code}")
    return response.json()

def get_waitlist_offer_status(token):
    response = requests.get(
        f"{BASE_URL}/registrations/waitlist/confirm/{token}"
    )
    print(f"Get offer status: {response.status_code}")
    return response.json()

def test_waitlist_timeout_flow():
    print("=== 测试递补确认超时机制 ===\n")
    
    print("1. 注册用户...")
    organizer = register_user("organizer@test.com", "123", is_organizer=True)
    user1 = register_user("user1@test.com", "123")
    user2 = register_user("user2@test.com", "123")
    user3 = register_user("user3@test.com", "123")
    
    print("\n2. 登录用户...")
    organizer_token = login_user("organizer@test.com", "123")["access_token"]
    user1_token = login_user("user1@test.com", "123")["access_token"]
    user2_token = login_user("user2@test.com", "123")["access_token"]
    user3_token = login_user("user3@test.com", "123")["access_token"]
    
    print("\n3. 创建活动（容量2人）...")
    event = create_event(organizer_token, "测试活动-递补超时", max_capacity=2)
    event_id = event["id"]
    
    print("\n4. 用户1和用户2报名（已满）...")
    reg1 = register_for_event(user1_token, event_id)
    reg2 = register_for_event(user2_token, event_id)
    
    print("\n5. 用户3报名（进入候补）...")
    reg3 = register_for_event(user3_token, event_id)
    assert reg3["status"] == "waitlisted", f"用户3应该进入候补，但状态是: {reg3['status']}"
    print("   ✓ 用户3成功进入候补名单")
    
    print("\n6. 用户1取消报名，触发递补...")
    cancel_result = cancel_registration(user1_token, reg1["id"])
    print(f"   取消结果: {cancel_result}")
    
    print("\n7. 检查用户3的状态（应该变为pending_confirmation）...")
    user3_registrations = get_registrations(user3_token)
    waitlist_reg = next((r for r in user3_registrations if r["event_id"] == event_id), None)
    assert waitlist_reg is not None, "用户3没有找到活动注册"
    assert waitlist_reg["status"] == "pending_confirmation", f"用户3状态应该是pending_confirmation，但实际是: {waitlist_reg['status']}"
    assert waitlist_reg["waitlist_offer_token"] is not None, "应该生成了确认token"
    offer_token = waitlist_reg["waitlist_offer_token"]
    print(f"   ✓ 用户3状态变为pending_confirmation")
    print(f"   ✓ 生成的确认token: {offer_token[:10]}...")
    
    print("\n8. 测试获取递补确认状态...")
    status = get_waitlist_offer_status(offer_token)
    assert status["success"] == True, "获取状态失败"
    assert "time_remaining_hours" in status, "缺少剩余时间信息"
    print(f"   ✓ 获取状态成功，剩余时间: {status['time_remaining_hours']:.2f}小时")
    
    print("\n9. 用户3接受递补名额...")
    confirm_result = confirm_waitlist_offer(offer_token, accept=True)
    assert confirm_result["success"] == True, "确认失败"
    assert confirm_result["registration"]["status"] == "confirmed", "状态应该是confirmed"
    assert confirm_result["registration"]["ticket_code"] is not None, "应该生成了票码"
    print(f"   ✓ 用户3成功接受递补")
    print(f"   ✓ 生成的票码: {confirm_result['registration']['ticket_code']}")
    
    print("\n10. 再次检查状态（token应该已失效）...")
    try:
        status = get_waitlist_offer_status(offer_token)
        assert status["success"] == False, "token应该已失效"
        print("   ✓ token已失效")
    except Exception as e:
        print(f"   ✓ token已失效: {e}")
    
    print("\n=== 测试完成！所有功能正常工作 ===")

if __name__ == "__main__":
    test_waitlist_timeout_flow()