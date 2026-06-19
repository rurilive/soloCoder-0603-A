"""
生成模拟客服和工单数据，用于演示和测试
"""
import random
import os
import sys
from datetime import datetime, timedelta, date
from sqlalchemy import create_engine, text, func
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import Base
from app.models import Agent, Ticket, AgentDailyStats, TeamDailyStats, TeamDeptDailyStats


is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False} if is_sqlite else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


AGENTS = [
    {"name": "张伟", "email": "zhangwei@example.com", "department": "技术支持"},
    {"name": "李娜", "email": "lina@example.com", "department": "技术支持"},
    {"name": "王芳", "email": "wangfang@example.com", "department": "客户服务"},
    {"name": "刘强", "email": "liuqiang@example.com", "department": "客户服务"},
    {"name": "陈静", "email": "chenjing@example.com", "department": "技术支持"},
    {"name": "赵磊", "email": "zhaolei@example.com", "department": "销售支持"},
    {"name": "孙丽", "email": "sunli@example.com", "department": "客户服务"},
    {"name": "周涛", "email": "zhoutao@example.com", "department": "技术支持"},
    {"name": "吴敏", "email": "wumin@example.com", "department": "销售支持"},
    {"name": "郑浩", "email": "zhenghao@example.com", "department": "技术支持"},
]

CATEGORIES = ["账户问题", "技术故障", "使用咨询", "退款申请", "功能建议", "账单问题", "其他"]
PRIORITIES = ["low", "normal", "high", "urgent"]
CUSTOMERS = [f"客户{i:03d}" for i in range(1, 201)]


def create_agents(db):
    agents = []
    for a in AGENTS:
        agent = Agent(
            name=a["name"],
            email=a["email"],
            department=a["department"],
            avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={a['name']}",
        )
        db.add(agent)
        agents.append(agent)
    db.commit()
    for agent in agents:
        db.refresh(agent)
    return agents


def random_time(base_date, start_hour=9, end_hour=21):
    hour = random.randint(start_hour, end_hour - 1)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return datetime.combine(base_date, datetime.min.time()) + timedelta(
        hours=hour, minutes=minute, seconds=second
    )


def create_tickets(db, agents, days=90, tickets_per_day=80):
    today = datetime.now().date()
    start_date = today - timedelta(days=days - 1)

    ticket_id = 1
    for day_offset in range(days):
        current_date = start_date + timedelta(days=day_offset)
        daily_tickets = random.randint(int(tickets_per_day * 0.7), int(tickets_per_day * 1.3))

        for _ in range(daily_tickets):
            agent = random.choice(agents)
            category = random.choice(CATEGORIES)
            priority = random.choice(PRIORITIES)

            created_at = random_time(current_date)
            assigned_at = created_at + timedelta(minutes=random.randint(1, 30))

            first_response_delay = random.randint(30, 600)
            first_response_at = assigned_at + timedelta(seconds=first_response_delay)

            resolution_hours = random.choice([0.5, 1, 2, 3, 4, 8, 12, 24, 48])
            resolved_at = created_at + timedelta(hours=resolution_hours)

            is_resolved = random.random() < 0.85
            status = "resolved" if is_resolved else random.choice(["open", "pending"])

            sla_deadline = created_at + timedelta(hours=24)
            sla_breached = 1 if (is_resolved and resolved_at > sla_deadline) else 0

            satisfaction_score = None
            if is_resolved:
                satisfaction_score = random.choice([3, 4, 5, 5, 4, 5, 4, 3, 5, 4])

            closed_at = resolved_at + timedelta(minutes=random.randint(5, 60)) if is_resolved else None
            if status != "closed":
                closed_at = None

            ticket = Ticket(
                id=ticket_id,
                title=f"{category} - 工单{ticket_id:04d}",
                description=f"这是一个关于{category}的客户咨询工单。",
                status=status,
                priority=priority,
                category=category,
                agent_id=agent.id,
                customer_name=random.choice(CUSTOMERS),
                customer_email=f"customer{ticket_id:04d}@example.com",
                created_at=created_at,
                assigned_at=assigned_at,
                first_response_at=first_response_at,
                resolved_at=resolved_at if is_resolved else None,
                closed_at=closed_at,
                satisfaction_score=satisfaction_score,
                sla_breached=sla_breached,
                sla_deadline=sla_deadline,
            )
            db.add(ticket)
            ticket_id += 1

        if day_offset % 30 == 0:
            db.commit()

    db.commit()
    print(f"生成了 {ticket_id - 1} 条工单数据")


def calculate_daily_stats(db):
    """从工单数据计算日统计，写入预聚合表"""
    print("计算日统计数据...")

    db.query(AgentDailyStats).delete()
    db.query(TeamDailyStats).delete()
    db.query(TeamDeptDailyStats).delete()
    db.commit()

    tickets = db.query(Ticket).filter(Ticket.agent_id.isnot(None)).all()

    agent_daily = {}
    team_daily = {}
    dept_daily = {}

    agents_map = {}
    for t in tickets:
        d = date(t.created_at.year, t.created_at.month, t.created_at.day)
        agent_id = t.agent_id

        if agent_id not in agents_map:
            agent = db.query(Agent).filter(Agent.id == agent_id).first()
            agents_map[agent_id] = agent
        agent = agents_map.get(agent_id)
        dept = agent.department if agent else "未知"

        key = (agent_id, d)
        if key not in agent_daily:
            agent_daily[key] = {
                "ticket_count": 0,
                "response_times": [],
                "resolved": 0,
                "sla_ok": 0,
                "sla_total_resolved": 0,
                "satisfaction_scores": [],
            }
        ad = agent_daily[key]
        ad["ticket_count"] += 1
        if t.first_response_at and t.assigned_at:
            rt = (t.first_response_at - t.assigned_at).total_seconds()
            ad["response_times"].append(rt)
        if t.status in ("resolved", "closed"):
            ad["resolved"] += 1
            ad["sla_total_resolved"] += 1
            if t.sla_breached == 0:
                ad["sla_ok"] += 1
        if t.satisfaction_score:
            ad["satisfaction_scores"].append(t.satisfaction_score)

        tkey = d
        if tkey not in team_daily:
            team_daily[tkey] = {
                "ticket_count": 0,
                "response_times": [],
                "resolved": 0,
                "sla_ok": 0,
                "sla_total_resolved": 0,
                "agents": set(),
            }
        td = team_daily[tkey]
        td["ticket_count"] += 1
        if t.first_response_at and t.assigned_at:
            rt = (t.first_response_at - t.assigned_at).total_seconds()
            td["response_times"].append(rt)
        if t.status in ("resolved", "closed"):
            td["resolved"] += 1
            td["sla_total_resolved"] += 1
            if t.sla_breached == 0:
                td["sla_ok"] += 1
        td["agents"].add(agent_id)

        dkey = (dept, d)
        if dkey not in dept_daily:
            dept_daily[dkey] = {
                "ticket_count": 0,
                "response_times": [],
                "resolved": 0,
                "sla_ok": 0,
                "sla_total_resolved": 0,
                "agents": set(),
            }
        dd = dept_daily[dkey]
        dd["ticket_count"] += 1
        if t.first_response_at and t.assigned_at:
            rt = (t.first_response_at - t.assigned_at).total_seconds()
            dd["response_times"].append(rt)
        if t.status in ("resolved", "closed"):
            dd["resolved"] += 1
            dd["sla_total_resolved"] += 1
            if t.sla_breached == 0:
                dd["sla_ok"] += 1
        dd["agents"].add(agent_id)

    stat_id = 1
    for (agent_id, d), data in agent_daily.items():
        avg_rt = sum(data["response_times"]) / len(data["response_times"]) if data["response_times"] else 0
        res_rate = (data["resolved"] / data["ticket_count"] * 100) if data["ticket_count"] > 0 else 0
        sla_rate = (data["sla_ok"] / data["sla_total_resolved"] * 100) if data["sla_total_resolved"] > 0 else 0
        avg_sat = sum(data["satisfaction_scores"]) / len(data["satisfaction_scores"]) if data["satisfaction_scores"] else 0

        stat = AgentDailyStats(
            id=stat_id,
            agent_id=agent_id,
            stat_date=d,
            ticket_count=data["ticket_count"],
            avg_response_time=round(avg_rt, 2),
            resolution_rate=round(res_rate, 2),
            sla_compliance_rate=round(sla_rate, 2),
            resolved_count=data["resolved"],
            avg_satisfaction=round(avg_sat, 2),
        )
        db.add(stat)
        stat_id += 1

    stat_id = 1
    for d, data in team_daily.items():
        avg_rt = sum(data["response_times"]) / len(data["response_times"]) if data["response_times"] else 0
        res_rate = (data["resolved"] / data["ticket_count"] * 100) if data["ticket_count"] > 0 else 0
        sla_rate = (data["sla_ok"] / data["sla_total_resolved"] * 100) if data["sla_total_resolved"] > 0 else 0

        stat = TeamDailyStats(
            id=stat_id,
            stat_date=d,
            department="all",
            ticket_count=data["ticket_count"],
            avg_response_time=round(avg_rt, 2),
            resolution_rate=round(res_rate, 2),
            sla_compliance_rate=round(sla_rate, 2),
            agent_count=len(data["agents"]),
        )
        db.add(stat)
        stat_id += 1

    stat_id = 1
    for (dept, d), data in dept_daily.items():
        avg_rt = sum(data["response_times"]) / len(data["response_times"]) if data["response_times"] else 0
        res_rate = (data["resolved"] / data["ticket_count"] * 100) if data["ticket_count"] > 0 else 0
        sla_rate = (data["sla_ok"] / data["sla_total_resolved"] * 100) if data["sla_total_resolved"] > 0 else 0

        stat = TeamDeptDailyStats(
            id=stat_id,
            stat_date=d,
            department=dept,
            ticket_count=data["ticket_count"],
            avg_response_time=round(avg_rt, 2),
            resolution_rate=round(res_rate, 2),
            sla_compliance_rate=round(sla_rate, 2),
            agent_count=len(data["agents"]),
        )
        db.add(stat)
        stat_id += 1

    db.commit()
    print("日统计数据计算完成")


def main():
    print("开始生成模拟数据...")

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        agents = create_agents(db)
        print(f"创建了 {len(agents)} 个客服")

        create_tickets(db, agents, days=90, tickets_per_day=80)

        calculate_daily_stats(db)

        print("数据生成完成！")

    finally:
        db.close()


if __name__ == "__main__":
    main()
