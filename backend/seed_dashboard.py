import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session, engine
from app.models import Base, User, UserRole, Ticket, TicketStatus, TicketPriority, TicketSLA, SLARule, TicketRating


async def seed_data():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        admin1 = User(
            username="admin1",
            email="admin1@test.com",
            password_hash="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYGyJYWfP5mY5wK",
            role=UserRole.admin,
            is_senior_agent=True,
        )
        agent1 = User(
            username="agent1",
            email="agent1@test.com",
            password_hash="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYGyJYWfP5mY5wK",
            role=UserRole.agent,
            is_senior_agent=False,
        )
        agent2 = User(
            username="agent2",
            email="agent2@test.com",
            password_hash="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYGyJYWfP5mY5wK",
            role=UserRole.agent,
            is_senior_agent=True,
        )
        agent3 = User(
            username="agent3",
            email="agent3@test.com",
            password_hash="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYGyJYWfP5mY5wK",
            role=UserRole.agent,
            is_senior_agent=False,
        )
        user1 = User(
            username="user1",
            email="user1@test.com",
            password_hash="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYGyJYWfP5mY5wK",
            role=UserRole.user,
            is_senior_agent=False,
        )

        db.add_all([admin1, agent1, agent2, agent3, user1])
        await db.flush()

        sla_rule = SLARule(
            category="general",
            priority=TicketPriority.medium,
            response_time_minutes=60,
            resolution_time_minutes=1440,
            warning_threshold=0.75,
            auto_escalate=False,
            is_active=True,
        )
        db.add(sla_rule)
        await db.flush()

        now = datetime.now(timezone.utc)
        agents = [agent1, agent2, agent3]
        statuses = [TicketStatus.closed, TicketStatus.resolved, TicketStatus.in_progress, TicketStatus.pending]

        for i in range(50):
            agent = agents[i % 3]
            days_ago = i % 20
            created_at = now - timedelta(days=days_ago, hours=i % 8)
            ticket = Ticket(
                title=f"测试工单 {i+1}",
                description=f"测试工单描述 {i+1}",
                status=statuses[i % 4],
                priority=TicketPriority.medium,
                category="general",
                user_id=user1.id,
                agent_id=agent.id,
                created_at=created_at,
                updated_at=created_at + timedelta(minutes=30),
                closed_at=created_at + timedelta(hours=2) if statuses[i % 4] in (TicketStatus.closed, TicketStatus.resolved) else None,
            )
            db.add(ticket)
            await db.flush()

            first_response_at = created_at + timedelta(minutes=10 + i % 20)
            resolved_at = created_at + timedelta(hours=1 + i % 5) if statuses[i % 4] in (TicketStatus.closed, TicketStatus.resolved) else None
            ticket_sla = TicketSLA(
                ticket_id=ticket.id,
                sla_rule_id=sla_rule.id,
                response_deadline=created_at + timedelta(minutes=60),
                resolution_deadline=created_at + timedelta(minutes=1440),
                first_response_at=first_response_at,
                resolved_at=resolved_at,
                response_breached=i % 10 == 0,
                resolution_breached=i % 15 == 0,
                response_warning_sent=False,
                resolution_warning_sent=False,
                escalated_count=0,
                created_at=created_at,
                updated_at=created_at + timedelta(minutes=30),
            )
            db.add(ticket_sla)

            if statuses[i % 4] in (TicketStatus.closed, TicketStatus.resolved) and i % 3 == 0:
                rating = TicketRating(
                    ticket_id=ticket.id,
                    user_id=user1.id,
                    score=3 + i % 3,
                    comment="测试评价",
                    created_at=created_at + timedelta(hours=2),
                )
                db.add(rating)

        await db.commit()
        print("测试数据填充完成：4个客服，50个工单，SLA和评分数据")


if __name__ == "__main__":
    asyncio.run(seed_data())
