import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.database import Base, async_session, engine
from app.models import User, UserRole


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        from sqlalchemy import select

        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
            )
            session.add(admin)

        result = await session.execute(select(User).where(User.username == "agent1"))
        if not result.scalar_one_or_none():
            agent = User(
                username="agent1",
                email="agent1@example.com",
                password_hash=hash_password("agent123"),
                role=UserRole.agent,
            )
            session.add(agent)

        result = await session.execute(select(User).where(User.username == "user1"))
        if not result.scalar_one_or_none():
            user = User(
                username="user1",
                email="user1@example.com",
                password_hash=hash_password("user123"),
                role=UserRole.user,
            )
            session.add(user)

        await session.commit()

    print("Database initialized with default users:")
    print("  admin  / admin123  (admin)")
    print("  agent1 / agent123  (agent)")
    print("  user1  / user123   (user)")


if __name__ == "__main__":
    asyncio.run(init())
