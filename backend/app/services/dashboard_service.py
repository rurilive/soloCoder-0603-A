from datetime import date, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_

from ..models import AgentDailyStats, TeamDailyStats, TeamDeptDailyStats, Agent, Ticket
from ..cache import cache_service
from ..config import settings


PERIOD_DAYS = {
    "day": 1,
    "week": 7,
    "month": 30,
    "quarter": 90,
}


def get_date_range(period: str) -> Tuple[date, date]:
    end_date = date.today()
    days = PERIOD_DAYS.get(period, 30)
    start_date = end_date - timedelta(days=days - 1)
    return start_date, end_date


def _cache_key(prefix: str, *args) -> str:
    return f"{settings.api_prefix}:{prefix}:{':'.join(str(a) for a in args)}"


def get_personal_stats(db: Session, agent_id: int, period: str = "month"):
    cache_key = _cache_key("dashboard:personal", agent_id, period)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = get_date_range(period)

    stats = db.query(
        func.sum(AgentDailyStats.ticket_count).label("ticket_count"),
        func.avg(AgentDailyStats.avg_response_time).label("avg_response_time"),
        func.avg(AgentDailyStats.resolution_rate).label("resolution_rate"),
        func.avg(AgentDailyStats.sla_compliance_rate).label("sla_compliance_rate"),
        func.sum(AgentDailyStats.resolved_count).label("resolved_count"),
        func.avg(AgentDailyStats.avg_satisfaction).label("avg_satisfaction"),
    ).filter(
        AgentDailyStats.agent_id == agent_id,
        AgentDailyStats.stat_date.between(start_date, end_date)
    ).first()

    agent = db.query(Agent).filter(Agent.id == agent_id).first()

    result = {
        "agent_id": agent_id,
        "agent_name": agent.name if agent else f"Agent {agent_id}",
        "period": period,
        "ticket_count": int(stats.ticket_count or 0),
        "avg_response_time": round(float(stats.avg_response_time or 0), 2),
        "resolution_rate": round(float(stats.resolution_rate or 0), 2),
        "sla_compliance_rate": round(float(stats.sla_compliance_rate or 0), 2),
        "resolved_count": int(stats.resolved_count or 0),
        "avg_satisfaction": round(float(stats.avg_satisfaction), 2) if stats.avg_satisfaction else None,
    }

    cache_service.set_json(cache_key, result)
    return result


def get_personal_trend(db: Session, agent_id: int, period: str = "month"):
    cache_key = _cache_key("dashboard:personal:trend", agent_id, period)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = get_date_range(period)

    stats = db.query(
        AgentDailyStats.stat_date,
        AgentDailyStats.ticket_count,
        AgentDailyStats.avg_response_time,
        AgentDailyStats.resolution_rate,
        AgentDailyStats.sla_compliance_rate,
    ).filter(
        AgentDailyStats.agent_id == agent_id,
        AgentDailyStats.stat_date.between(start_date, end_date)
    ).order_by(AgentDailyStats.stat_date).all()

    data = []
    stats_by_date = {s.stat_date: s for s in stats}

    current = start_date
    while current <= end_date:
        if current in stats_by_date:
            s = stats_by_date[current]
            data.append({
                "date": current.isoformat(),
                "ticket_count": int(s.ticket_count or 0),
                "avg_response_time": round(float(s.avg_response_time or 0), 2),
                "resolution_rate": round(float(s.resolution_rate or 0), 2),
                "sla_compliance_rate": round(float(s.sla_compliance_rate or 0), 2),
            })
        else:
            data.append({
                "date": current.isoformat(),
                "ticket_count": 0,
                "avg_response_time": 0.0,
                "resolution_rate": 0.0,
                "sla_compliance_rate": 0.0,
            })
        current += timedelta(days=1)

    result = {
        "agent_id": agent_id,
        "period": period,
        "data": data,
    }

    cache_service.set_json(cache_key, result)
    return result


def get_team_overview(db: Session, period: str = "month", department: str = "all"):
    cache_key = _cache_key("dashboard:team:overview", period, department)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = get_date_range(period)

    if department and department != "all":
        stats_model = TeamDeptDailyStats
        query = db.query(
            func.sum(stats_model.ticket_count).label("total_tickets"),
            func.avg(stats_model.avg_response_time).label("avg_response_time"),
            func.avg(stats_model.resolution_rate).label("resolution_rate"),
            func.avg(stats_model.sla_compliance_rate).label("sla_compliance_rate"),
            func.avg(stats_model.agent_count).label("agent_count"),
        ).filter(
            stats_model.stat_date.between(start_date, end_date),
            stats_model.department == department
        )
    else:
        stats_model = TeamDailyStats
        query = db.query(
            func.sum(stats_model.ticket_count).label("total_tickets"),
            func.avg(stats_model.avg_response_time).label("avg_response_time"),
            func.avg(stats_model.resolution_rate).label("resolution_rate"),
            func.avg(stats_model.sla_compliance_rate).label("sla_compliance_rate"),
            func.avg(stats_model.agent_count).label("agent_count"),
        ).filter(
            stats_model.stat_date.between(start_date, end_date),
            stats_model.department == "all"
        )

    stats = query.first()

    result = {
        "period": period,
        "department": department,
        "total_tickets": int(stats.total_tickets or 0),
        "avg_response_time": round(float(stats.avg_response_time or 0), 2),
        "resolution_rate": round(float(stats.resolution_rate or 0), 2),
        "sla_compliance_rate": round(float(stats.sla_compliance_rate or 0), 2),
        "agent_count": int(stats.agent_count or 0),
    }

    cache_service.set_json(cache_key, result)
    return result


def get_team_trend(db: Session, period: str = "month", department: str = "all"):
    cache_key = _cache_key("dashboard:team:trend", period, department)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = get_date_range(period)

    if department and department != "all":
        stats_model = TeamDeptDailyStats
        query = db.query(
            stats_model.stat_date,
            stats_model.ticket_count,
            stats_model.avg_response_time,
            stats_model.resolution_rate,
            stats_model.sla_compliance_rate,
        ).filter(
            stats_model.stat_date.between(start_date, end_date),
            stats_model.department == department
        )
    else:
        stats_model = TeamDailyStats
        query = db.query(
            stats_model.stat_date,
            stats_model.ticket_count,
            stats_model.avg_response_time,
            stats_model.resolution_rate,
            stats_model.sla_compliance_rate,
        ).filter(
            stats_model.stat_date.between(start_date, end_date),
            stats_model.department == "all"
        )

    stats = query.order_by(stats_model.stat_date).all()

    data = []
    stats_by_date = {s.stat_date: s for s in stats}

    current = start_date
    while current <= end_date:
        if current in stats_by_date:
            s = stats_by_date[current]
            data.append({
                "date": current.isoformat(),
                "ticket_count": int(s.ticket_count or 0),
                "avg_response_time": round(float(s.avg_response_time or 0), 2),
                "resolution_rate": round(float(s.resolution_rate or 0), 2),
                "sla_compliance_rate": round(float(s.sla_compliance_rate or 0), 2),
            })
        else:
            data.append({
                "date": current.isoformat(),
                "ticket_count": 0,
                "avg_response_time": 0.0,
                "resolution_rate": 0.0,
                "sla_compliance_rate": 0.0,
            })
        current += timedelta(days=1)

    result = {
        "period": period,
        "department": department,
        "data": data,
    }

    cache_service.set_json(cache_key, result)
    return result


def get_team_ranking(db: Session, period: str = "month", department: str = "all", limit: int = 20):
    cache_key = _cache_key("dashboard:team:ranking", period, department, limit)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = get_date_range(period)

    query = db.query(
        AgentDailyStats.agent_id,
        func.sum(AgentDailyStats.ticket_count).label("ticket_count"),
        func.avg(AgentDailyStats.avg_response_time).label("avg_response_time"),
        func.avg(AgentDailyStats.resolution_rate).label("resolution_rate"),
        func.avg(AgentDailyStats.sla_compliance_rate).label("sla_compliance_rate"),
    ).filter(
        AgentDailyStats.stat_date.between(start_date, end_date)
    ).group_by(AgentDailyStats.agent_id)

    if department and department != "all":
        query = query.join(Agent, Agent.id == AgentDailyStats.agent_id).filter(
            Agent.department == department
        )

    stats_list = query.order_by(func.sum(AgentDailyStats.ticket_count).desc()).limit(limit).all()

    agent_ids = [s.agent_id for s in stats_list]
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
    agent_map = {a.id: a for a in agents}

    ranking = []
    for idx, s in enumerate(stats_list):
        agent = agent_map.get(s.agent_id)
        ranking.append({
            "agent_id": s.agent_id,
            "agent_name": agent.name if agent else f"Agent {s.agent_id}",
            "avatar": agent.avatar if agent else None,
            "ticket_count": int(s.ticket_count or 0),
            "avg_response_time": round(float(s.avg_response_time or 0), 2),
            "resolution_rate": round(float(s.resolution_rate or 0), 2),
            "sla_compliance_rate": round(float(s.sla_compliance_rate or 0), 2),
            "rank": idx + 1,
        })

    result = {
        "period": period,
        "department": department,
        "ranking": ranking,
    }

    cache_service.set_json(cache_key, result)
    return result


def refresh_materialized_views(db: Session):
    db.execute(text("REFRESH MATERIALIZED VIEW mv_agent_daily_stats"))
    db.execute(text("REFRESH MATERIALIZED VIEW mv_team_daily_stats"))
    db.commit()

    cache_service.invalidate_pattern(f"{settings.api_prefix}:dashboard:*")

    return {"status": "success", "message": "Materialized views refreshed"}
