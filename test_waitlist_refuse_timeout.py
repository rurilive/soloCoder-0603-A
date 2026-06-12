import requests

BASE_URL = "http://localhost:1111"

def register_user(email, password, is_organizer=False):
    response = requests.post(
        f"{BASE_URL}/users/register",
        json={"username": email.split('@')[0], "email": email, "password": password, "is_organizer": is_organizer}
    )
    return response.json()

def login_user(email, password):
    response = requests.post(
        f"{BASE_URL}/users/login",
        json={"email": email, "password": password}
    )
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
    return response.json()

def register_for_event(token, event_id):
    response = requests.post(
        f"{BASE_URL}/registrations",
        json={"event_id": event_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.json()

def cancel_registration(token, registration_id):
    response = requests.delete(
        f"{BASE_URL}/registrations/{registration_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.json()

def get_registrations(token):
    response = requests.get(
        f"{BASE_URL}/registrations",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.json()

def confirm_waitlist_offer(token, accept=True):
    response = requests.post(
        f"{BASE_URL}/registrations/waitlist/confirm",
        json={"token": token, "accept": accept}
    )
    return response

def get_waitlist_offer_status(token):
    response = requests.get(
        f"{BASE_URL}/registrations/waitlist/confirm/{token}"
    )
    return response

def test_refuse_waitlist_offer():
    print("=== 测试拒绝递补名额 ===\n")
    
    print("1. 注册用户...")
    organizer = register_user("refuse_organizer@test.com", "123", is_organizer=True)
    user1 = register_user("refuse_user1@test.com", "123")
    user2 = register_user("refuse_user2@test.com", "123")
    user3 = register_user("refuse_user3@test.com", "123")
    
    print("\n2. 登录用户...")
    organizer_token = login_user("refuse_organizer@test.com", "123")["access_token"]
    user1_token = login_user("refuse_user1@test.com", "123")["access_token"]
    user2_token = login_user("refuse_user2@test.com", "123")["access_token"]
    user3_token = login_user("refuse_user3@test.com", "123")["access_token"]
    
    print("\n3. 创建活动（容量2人）...")
    event = create_event(organizer_token, "测试活动-拒绝递补", max_capacity=2)
    event_id = event["id"]
    
    print("\n4. 用户1和用户2报名（已满）...")
    reg1 = register_for_event(user1_token, event_id)
    reg2 = register_for_event(user2_token, event_id)
    
    print("\n5. 用户3报名（进入候补）...")
    reg3 = register_for_event(user3_token, event_id)
    print(f"   用户3状态: {reg3['status']}, 候补位置: {reg3.get('waitlist_position')}")
    
    print("\n6. 用户1取消报名，触发用户3递补...")
    cancel_result = cancel_registration(user1_token, reg1["id"])
    print(f"   取消结果: {cancel_result}")
    
    print("\n7. 获取用户3的递补token...")
    user3_regs = get_registrations(user3_token)
    waitlist_reg = next((r for r in user3_regs if r["event_id"] == event_id), None)
    assert waitlist_reg is not None, "用户3没有找到活动注册"
    offer_token = waitlist_reg["waitlist_offer_token"]
    print(f"   ✓ 用户3递补token: {offer_token[:10]}...")
    
    print("\n8. 用户3拒绝递补名额...")
    response = confirm_waitlist_offer(offer_token, accept=False)
    result = response.json()
    print(f"   拒绝结果: {result}")
    assert response.status_code == 200, f"拒绝请求失败: {response.status_code}"
    assert result["success"] == True, "拒绝应该成功"
    print(f"   ✓ 用户3拒绝了递补名额")
    
    print("\n9. 验证用户3的报名记录保留但状态为cancelled...")
    user3_regs_after = get_registrations(user3_token)
    user3_reg_after = next((r for r in user3_regs_after if r["event_id"] == event_id), None)
    assert user3_reg_after is not None, f"用户3的报名记录应该保留"
    assert user3_reg_after["status"] == "cancelled", f"用户3的状态应该是cancelled，但实际是: {user3_reg_after['status']}"
    print(f"   ✓ 用户3的报名记录保留，状态为cancelled")
    
    print("\n=== 拒绝测试完成！ ===")

def test_timeout_handling():
    print("\n\n=== 测试超时处理 ===\n")
    
    print("1. 注册用户...")
    organizer = register_user("timeout_organizer@test.com", "123", is_organizer=True)
    user1 = register_user("timeout_user1@test.com", "123")
    user2 = register_user("timeout_user2@test.com", "123")
    user3 = register_user("timeout_user3@test.com", "123")
    
    print("\n2. 登录用户...")
    organizer_token = login_user("timeout_organizer@test.com", "123")["access_token"]
    user1_token = login_user("timeout_user1@test.com", "123")["access_token"]
    user2_token = login_user("timeout_user2@test.com", "123")["access_token"]
    user3_token = login_user("timeout_user3@test.com", "123")["access_token"]
    
    print("\n3. 创建活动（容量2人）...")
    event = create_event(organizer_token, "测试活动-超时处理", max_capacity=2)
    event_id = event["id"]
    
    print("\n4. 用户1和用户2报名（已满）...")
    reg1 = register_for_event(user1_token, event_id)
    reg2 = register_for_event(user2_token, event_id)
    
    print("\n5. 用户3报名（进入候补）...")
    reg3 = register_for_event(user3_token, event_id)
    print(f"   用户3状态: {reg3['status']}")
    
    print("\n6. 用户1取消报名，触发用户3递补...")
    cancel_result = cancel_registration(user1_token, reg1["id"])
    
    print("\n7. 获取用户3的递补token...")
    user3_regs = get_registrations(user3_token)
    waitlist_reg = next((r for r in user3_regs if r["event_id"] == event_id), None)
    offer_token = waitlist_reg["waitlist_offer_token"]
    
    # 模拟超时：直接通过数据库修改 waitlist_offer_sent_at 为24小时前
    print("\n8. 模拟超时（修改数据库中的发送时间）...")
    import sqlite3
    conn = sqlite3.connect('/data/projects/work/soloCoder-0602/repos/a/backend/event.db')
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE registrations 
        SET waitlist_offer_sent_at = datetime('now', '-25 hours')
        WHERE waitlist_offer_token = ?
    """, (offer_token,))
    conn.commit()
    conn.close()
    print("   ✓ 已将发送时间设置为25小时前")
    
    print("\n9. 触发超时检查...")
    response = get_waitlist_offer_status(offer_token)
    result = response.json()
    print(f"   超时处理结果: {result}")
    assert result["success"] == True, "超时处理应该成功"
    print(f"   ✓ 超时用户已被处理")
    
    print("\n10. 验证用户3的报名记录保留但状态为cancelled...")
    user3_regs_after = get_registrations(user3_token)
    user3_reg_after = next((r for r in user3_regs_after if r["event_id"] == event_id), None)
    assert user3_reg_after is not None, f"超时用户3的报名记录应该保留"
    assert user3_reg_after["status"] == "cancelled", f"超时用户3的状态应该是cancelled，但实际是: {user3_reg_after['status']}"
    print(f"   ✓ 超时用户的报名记录保留，状态为cancelled")
    
    print("\n=== 超时测试完成！ ===")

if __name__ == "__main__":
    test_refuse_waitlist_offer()
    test_timeout_handling()