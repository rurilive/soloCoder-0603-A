from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User, Ticket, TicketSLA, TicketRating, TicketStatus, UserRole
from ..cache import cache_service
from ..config import settings


PERIOD_DAYS = {
    "day": 1,
    "week": 7,
    "month": 30,
    "quarter": 90,
}


def _get_date_range(period: str) -> tuple[date, date]:
    end_date = datetime.now(timezone.utc).date()
    days = PERIOD_DAYS.get(period, 30)
    start_date = end_date - timedelta(days=days - 1)
    return start_date, end_date


def _cache_key(prefix: str, *args) -> str:
    return f"{settings.api_prefix}:{prefix}:{':'.join(str(a) for a in args)}"


def _resolved_case():
    return case(
        (Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]), 1),
        else_=0,
    )


def _sla_ok_case():
    return case(
        (TicketSLA.resolution_breached == False, 1),  # noqa: E712
        else_=0,
    )


def _response_time_expr():
    return (func.julianday(TicketSLA.first_response_at) - func.julianday(Ticket.created_at)) * 86400


def _agent_subq():
    return select(User.id).where(User.role.in_([UserRole.agent, UserRole.admin]))


def _fill_date_range(start_date: date, end_date: date, daily: dict) -> list[dict]:
    data = []
    current = start_date
    while current <= end_date:
        ds = current.isoformat()
        entry = daily.get(ds, {})
        tc = entry.get("ticket_count", 0)
        res = entry.get("resolved", 0)
        data.append({
            "date": ds,
            "ticket_count": tc,
            "avg_response_time": entry.get("avg_response_time", 0.0),
            "resolution_rate": round((res / tc * 100), 2) if tc > 0 else 0.0,
            "sla_compliance_rate": entry.get("sla_compliance_rate", 0.0),
        })
        current += timedelta(days=1)
    return data


async def get_personal_stats(db: AsyncSession, agent_id: int, period: str = "month"):
    cache_key = _cache_key("dashboard:personal", agent_id, period)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
    date_filter = and_(
        Ticket.agent_id == agent_id,
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )

    agent_result = await db.execute(select(User).where(User.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    agent_name = agent.username if agent else f"Agent {agent_id}"

    count_row = (await db.execute(
        select(
            func.count(Ticket.id).label("ticket_count"),
            func.sum(_resolved_case()).label("resolved_count"),
        ).where(date_filter)
    )).one()
    ticket_count = count_row.ticket_count or 0
    resolved_count = count_row.resolved_count or 0

    avg_rt_row = (await db.execute(
        select(func.avg(_response_time_expr()).label("avg_rt"))
        .select_from(Ticket)
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            TicketSLA.first_response_at.isnot(None),
            TicketSLA.first_response_at > Ticket.created_at,
        )
    )).one_or_none()
    avg_response_time = round(avg_rt_row.avg_rt, 2) if avg_rt_row and avg_rt_row.avg_rt else 0.0

    sla_row = (await db.execute(
        select(
            func.count(TicketSLA.id).label("sla_total"),
            func.sum(_sla_ok_case()).label("sla_ok"),
        )
        .select_from(Ticket)
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
    )).one()
    sla_total = sla_row.sla_total or 0
    sla_ok = sla_row.sla_ok or 0
    sla_compliance_rate = round((sla_ok / sla_total * 100), 2) if sla_total > 0 else 0.0

    sat_row = (await db.execute(
        select(func.avg(TicketRating.score).label("avg_sat"))
        .select_from(Ticket)
        .join(TicketRating, TicketRating.ticket_id == Ticket.id)
        .where(date_filter, TicketRating.score.isnot(None))
    )).one_or_none()
    avg_satisfaction = round(sat_row.avg_sat, 2) if sat_row and sat_row.avg_sat else None

    result = {
        "agent_id": agent_id,
        "agent_name": agent_name,
        "period": period,
        "ticket_count": ticket_count,
        "avg_response_time": avg_response_time,
        "resolution_rate": round((resolved_count / ticket_count * 100), 2) if ticket_count > 0 else 0.0,
        "sla_compliance_rate": sla_compliance_rate,
        "resolved_count": resolved_count,
        "avg_satisfaction": avg_satisfaction,
    }

    cache_service.set_json(cache_key, result)
    return result


async def get_personal_trend(db: AsyncSession, agent_id: int, period: str = "month"):
    cache_key = _cache_key("dashboard:personal:trend", agent_id, period)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
    date_filter = and_(
        Ticket.agent_id == agent_id,
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )

    daily: dict[str, dict] = {}

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.count(Ticket.id).label("ticket_count"),
            func.sum(_resolved_case()).label("resolved"),
        )
        .where(date_filter)
        .group_by(func.date(Ticket.created_at))
    )).all():
        daily[r.d] = {"ticket_count": r.ticket_count or 0, "resolved": r.resolved or 0}

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.avg(_response_time_expr()).label("avg_rt"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            TicketSLA.first_response_at.isnot(None),
            TicketSLA.first_response_at > Ticket.created_at,
        )
        .group_by(func.date(Ticket.created_at))
    )).all():
        daily.setdefault(r.d, {})["avg_response_time"] = round(r.avg_rt, 2) if r.avg_rt else 0.0

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.count(TicketSLA.id).label("sla_total"),
            func.sum(_sla_ok_case()).label("sla_ok"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
        .group_by(func.date(Ticket.created_at))
    )).all():
        total = r.sla_total or 0
        ok = r.sla_ok or 0
        daily.setdefault(r.d, {})["sla_compliance_rate"] = round((ok / total * 100), 2) if total > 0 else 0.0

    result = {
        "agent_id": agent_id,
        "period": period,
        "data": _fill_date_range(start_date, end_date, daily),
    }

    cache_service.set_json(cache_key, result)
    return result


async def get_team_overview(db: AsyncSession, period: str = "month", department: str = "all"):
    cache_key = _cache_key("dashboard:team:overview", period, department)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    agent_count = (await db.execute(
        select(func.count(User.id)).where(User.role.in_([UserRole.agent, UserRole.admin]))
    )).scalar() or 0

    date_filter = and_(
        Ticket.agent_id.in_(_agent_subq()),
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )

    count_row = (await db.execute(
        select(
            func.count(Ticket.id).label("ticket_count"),
            func.sum(_resolved_case()).label("resolved_count"),
        ).where(date_filter)
    )).one()
    ticket_count = count_row.ticket_count or 0
    resolved_count = count_row.resolved_count or 0

    avg_rt_row = (await db.execute(
        select(func.avg(_response_time_expr()).label("avg_rt"))
        .select_from(Ticket)
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            TicketSLA.first_response_at.isnot(None),
            TicketSLA.first_response_at > Ticket.created_at,
        )
    )).one_or_none()
    avg_response_time = round(avg_rt_row.avg_rt, 2) if avg_rt_row and avg_rt_row.avg_rt else 0.0

    sla_row = (await db.execute(
        select(
            func.count(TicketSLA.id).label("sla_total"),
            func.sum(_sla_ok_case()).label("sla_ok"),
        )
        .select_from(Ticket)
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
    )).one()
    sla_total = sla_row.sla_total or 0
    sla_ok = sla_row.sla_ok or 0
    sla_compliance_rate = round((sla_ok / sla_total * 100), 2) if sla_total > 0 else 0.0

    result = {
        "period": period,
        "department": department,
        "total_tickets": ticket_count,
        "avg_response_time": avg_response_time,
        "resolution_rate": round((resolved_count / ticket_count * 100), 2) if ticket_count > 0 else 0.0,
        "sla_compliance_rate": sla_compliance_rate,
        "agent_count": agent_count,
    }

    cache_service.set_json(cache_key, result)
    return result


async def get_team_trend(db: AsyncSession, period: str = "month", department: str = "all"):
    cache_key = _cache_key("dashboard:team:trend", period, department)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
    date_filter = and_(
        Ticket.agent_id.in_(_agent_subq()),
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )

    daily: dict[str, dict] = {}

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.count(Ticket.id).label("ticket_count"),
            func.sum(_resolved_case()).label("resolved"),
        )
        .where(date_filter)
        .group_by(func.date(Ticket.created_at))
    )).all():
        daily[r.d] = {"ticket_count": r.ticket_count or 0, "resolved": r.resolved or 0}

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.avg(_response_time_expr()).label("avg_rt"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            TicketSLA.first_response_at.isnot(None),
            TicketSLA.first_response_at > Ticket.created_at,
        )
        .group_by(func.date(Ticket.created_at))
    )).all():
        daily.setdefault(r.d, {})["avg_response_time"] = round(r.avg_rt, 2) if r.avg_rt else 0.0

    for r in (await db.execute(
        select(
            func.date(Ticket.created_at).label("d"),
            func.count(TicketSLA.id).label("sla_total"),
            func.sum(_sla_ok_case()).label("sla_ok"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
        .group_by(func.date(Ticket.created_at))
    )).all():
        total = r.sla_total or 0
        ok = r.sla_ok or 0
        daily.setdefault(r.d, {})["sla_compliance_rate"] = round((ok / total * 100), 2) if total > 0 else 0.0

    result = {
        "period": period,
        "department": department,
        "data": _fill_date_range(start_date, end_date, daily),
    }

    cache_service.set_json(cache_key, result)
    return result


async def get_team_ranking(
    db: AsyncSession, period: str = "month", department: str = "all", limit: int = 20
):
    cache_key = _cache_key("dashboard:team:ranking", period, department, limit)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    agents = (await db.execute(
        select(User.id, User.username).where(User.role.in_([UserRole.agent, UserRole.admin]))
    )).all()
    agent_map = {a.id: a.username for a in agents}

    if not agent_map:
        result = {"period": period, "department": department, "ranking": []}
        cache_service.set_json(cache_key, result)
        return result

    date_filter = and_(
        Ticket.agent_id.in_(agent_map.keys()),
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )

    agent_counts: dict[int, dict] = {}
    for r in (await db.execute(
        select(
            Ticket.agent_id,
            func.count(Ticket.id).label("ticket_count"),
            func.sum(_resolved_case()).label("resolved_count"),
        )
        .where(date_filter)
        .group_by(Ticket.agent_id)
    )).all():
        agent_counts[r.agent_id] = {
            "ticket_count": r.ticket_count or 0,
            "resolved_count": r.resolved_count or 0,
        }

    agent_rt: dict[int, float] = {}
    for r in (await db.execute(
        select(
            Ticket.agent_id,
            func.avg(_response_time_expr()).label("avg_rt"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            TicketSLA.first_response_at.isnot(None),
            TicketSLA.first_response_at > Ticket.created_at,
        )
        .group_by(Ticket.agent_id)
    )).all():
        agent_rt[r.agent_id] = round(r.avg_rt, 2) if r.avg_rt else 0.0

    agent_sla: dict[int, float] = {}
    for r in (await db.execute(
        select(
            Ticket.agent_id,
            func.count(TicketSLA.id).label("sla_total"),
            func.sum(_sla_ok_case()).label("sla_ok"),
        )
        .join(TicketSLA, Ticket.id == TicketSLA.ticket_id)
        .where(
            date_filter,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
        .group_by(Ticket.agent_id)
    )).all():
        total = r.sla_total or 0
        ok = r.sla_ok or 0
        agent_sla[r.agent_id] = round((ok / total * 100), 2) if total > 0 else 0.0

    ranking_list = []
    for aid, name in agent_map.items():
        ac = agent_counts.get(aid)
        if not ac:
            continue
        tc = ac["ticket_count"]
        rc = ac["resolved_count"]
        ranking_list.append({
            "agent_id": aid,
            "agent_name": name,
            "avatar": None,
            "department": None,
            "ticket_count": tc,
            "avg_response_time": agent_rt.get(aid, 0.0),
            "resolution_rate": round((rc / tc * 100), 2) if tc > 0 else 0.0,
            "sla_compliance_rate": agent_sla.get(aid, 0.0),
        })

    ranking_list.sort(key=lambda x: x["ticket_count"], reverse=True)
    for idx, item in enumerate(ranking_list):
        item["rank"] = idx + 1

    ranking_list = ranking_list[:limit]

    result = {
        "period": period,
        "department": department,
        "ranking": ranking_list,
    }

    cache_service.set_json(cache_key, result)
    return result


async def refresh_cache():
    cache_service.invalidate_pattern(f"{settings.api_prefix}:dashboard:*")
    return {"status": "success", "message": "Cache invalidated"}
