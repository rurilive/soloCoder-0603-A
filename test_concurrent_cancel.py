import asyncio
import aiohttp
import json

async def cancel_registration(session, token, registration_id):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    async with session.delete(f"http://localhost:1111/registrations/{registration_id}", headers=headers) as response:
        return await response.json()

async def main():
    user1_token = None
    user2_token = None
    
    async with aiohttp.ClientSession() as session:
        login_response = await session.post(
            "http://localhost:1111/users/login",
            data=json.dumps({"email": "user1@test.com", "password": "123"}),
            headers={"Content-Type": "application/json"}
        )
        user1_data = await login_response.json()
        user1_token = user1_data["access_token"]
        
        login_response = await session.post(
            "http://localhost:1111/users/login",
            data=json.dumps({"email": "user2@test.com", "password": "123"}),
            headers={"Content-Type": "application/json"}
        )
        user2_data = await login_response.json()
        user2_token = user2_data["access_token"]
        
        print("Starting concurrent cancel operations...")
        
        task1 = asyncio.create_task(cancel_registration(session, user1_token, 1))
        task2 = asyncio.create_task(cancel_registration(session, user2_token, 2))
        
        result1, result2 = await asyncio.gather(task1, task2)
        
        print(f"User1 cancel result: {result1}")
        print(f"User2 cancel result: {result2}")
        
        event_response = await session.get("http://localhost:1111/events/1/detail")
        event_data = await event_response.json()
        print(f"Event status after cancellations: {event_data}")
        
        registrations_response = await session.get(
            "http://localhost:1111/registrations/",
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        all_registrations = await registrations_response.json()
        print(f"All registrations: {all_registrations}")

if __name__ == "__main__":
    asyncio.run(main())