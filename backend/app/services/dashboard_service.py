from datetime import date, datetime, timedelta, timezone
from collections import defaultdict

from sqlalchemy import select
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


def _agent_display_name(user: User) -> str:
    return user.username


async def get_personal_stats(db: AsyncSession, agent_id: int, period: str = "month"):
    cache_key = _cache_key("dashboard:personal", agent_id, period)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)

    agent_result = await db.execute(select(User).where(User.id == agent_id))
    agent = agent_result.scalar_one_or_none()
    agent_name = _agent_display_name(agent) if agent else f"Agent {agent_id}"

    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    tickets_query = (
        select(Ticket)
        .options()
        .where(
            Ticket.agent_id == agent_id,
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
        )
    )
    tickets_result = await db.execute(tickets_query)
    tickets = tickets_result.scalars().all()

    ticket_ids = [t.id for t in tickets]
    sla_map = {}
    rating_map = {}

    if ticket_ids:
        sla_result = await db.execute(
            select(TicketSLA).where(TicketSLA.ticket_id.in_(ticket_ids))
        )
        for sla in sla_result.scalars().all():
            sla_map[sla.ticket_id] = sla

        rating_result = await db.execute(
            select(TicketRating).where(TicketRating.ticket_id.in_(ticket_ids))
        )
        for rating in rating_result.scalars().all():
            rating_map[rating.ticket_id] = rating

    total_count = len(tickets)
    resolved_count = 0
    response_times = []
    sla_ok = 0
    sla_total_resolved = 0
    satisfaction_scores = []

    for t in tickets:
        if t.status in (TicketStatus.resolved, TicketStatus.closed):
            resolved_count += 1
            sla_total_resolved += 1
            sla = sla_map.get(t.id)
            if sla and not sla.resolution_breached:
                sla_ok += 1

        sla = sla_map.get(t.id)
        if sla and sla.first_response_at and t.created_at:
            rt = (sla.first_response_at - t.created_at).total_seconds()
            if rt > 0:
                response_times.append(rt)

        rating = rating_map.get(t.id)
        if rating and rating.score:
            satisfaction_scores.append(rating.score)

    avg_response_time = round(sum(response_times) / len(response_times), 2) if response_times else 0.0
    resolution_rate = round((resolved_count / total_count * 100), 2) if total_count > 0 else 0.0
    sla_compliance_rate = round((sla_ok / sla_total_resolved * 100), 2) if sla_total_resolved > 0 else 0.0
    avg_satisfaction = (
        round(sum(satisfaction_scores) / len(satisfaction_scores), 2) if satisfaction_scores else None
    )

    result = {
        "agent_id": agent_id,
        "agent_name": agent_name,
        "period": period,
        "ticket_count": total_count,
        "avg_response_time": avg_response_time,
        "resolution_rate": resolution_rate,
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

    tickets_query = select(Ticket).where(
        Ticket.agent_id == agent_id,
        Ticket.created_at >= start_dt,
        Ticket.created_at <= end_dt,
    )
    tickets_result = await db.execute(tickets_query)
    tickets = tickets_result.scalars().all()

    ticket_ids = [t.id for t in tickets]
    sla_map = {}
    if ticket_ids:
        sla_result = await db.execute(
            select(TicketSLA).where(TicketSLA.ticket_id.in_(ticket_ids))
        )
        for sla in sla_result.scalars().all():
            sla_map[sla.ticket_id] = sla

    daily_data = defaultdict(lambda: {
        "ticket_count": 0,
        "response_times": [],
        "resolved": 0,
        "sla_ok": 0,
        "sla_total_resolved": 0,
    })

    for t in tickets:
        d = t.created_at.date()
        dd = daily_data[d]
        dd["ticket_count"] += 1

        if t.status in (TicketStatus.resolved, TicketStatus.closed):
            dd["resolved"] += 1
            dd["sla_total_resolved"] += 1
            sla = sla_map.get(t.id)
            if sla and not sla.resolution_breached:
                dd["sla_ok"] += 1

        sla = sla_map.get(t.id)
        if sla and sla.first_response_at and t.created_at:
            rt = (sla.first_response_at - t.created_at).total_seconds()
            if rt > 0:
                dd["response_times"].append(rt)

    data = []
    current = start_date
    while current <= end_date:
        dd = daily_data.get(current)
        if dd:
            avg_rt = round(sum(dd["response_times"]) / len(dd["response_times"]), 2) if dd["response_times"] else 0.0
            res_rate = round((dd["resolved"] / dd["ticket_count"] * 100), 2) if dd["ticket_count"] > 0 else 0.0
            sla_rate = round((dd["sla_ok"] / dd["sla_total_resolved"] * 100), 2) if dd["sla_total_resolved"] > 0 else 0.0
            data.append({
                "date": current.isoformat(),
                "ticket_count": dd["ticket_count"],
                "avg_response_time": avg_rt,
                "resolution_rate": res_rate,
                "sla_compliance_rate": sla_rate,
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


async def get_team_overview(db: AsyncSession, period: str = "month", department: str = "all"):
    cache_key = _cache_key("dashboard:team:overview", period, department)
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    start_date, end_date = _get_date_range(period)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    agent_query = select(User).where(User.role.in_([UserRole.agent, UserRole.admin]))
    agent_result = await db.execute(agent_query)
    agents = agent_result.scalars().all()
    agent_ids = [a.id for a in agents]
    agent_count = len(agent_ids)

    total_count = 0
    resolved_count = 0
    response_times = []
    sla_ok = 0
    sla_total_resolved = 0

    if agent_ids:
        tickets_query = select(Ticket).where(
            Ticket.agent_id.in_(agent_ids),
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
        )
        tickets_result = await db.execute(tickets_query)
        tickets = tickets_result.scalars().all()

        ticket_ids = [t.id for t in tickets]
        sla_map = {}
        if ticket_ids:
            sla_result = await db.execute(
                select(TicketSLA).where(TicketSLA.ticket_id.in_(ticket_ids))
            )
            for sla in sla_result.scalars().all():
                sla_map[sla.ticket_id] = sla

        total_count = len(tickets)
        for t in tickets:
            if t.status in (TicketStatus.resolved, TicketStatus.closed):
                resolved_count += 1
                sla_total_resolved += 1
                sla = sla_map.get(t.id)
                if sla and not sla.resolution_breached:
                    sla_ok += 1

            sla = sla_map.get(t.id)
            if sla and sla.first_response_at and t.created_at:
                rt = (sla.first_response_at - t.created_at).total_seconds()
                if rt > 0:
                    response_times.append(rt)

    avg_response_time = round(sum(response_times) / len(response_times), 2) if response_times else 0.0
    resolution_rate = round((resolved_count / total_count * 100), 2) if total_count > 0 else 0.0
    sla_compliance_rate = round((sla_ok / sla_total_resolved * 100), 2) if sla_total_resolved > 0 else 0.0

    result = {
        "period": period,
        "department": department,
        "total_tickets": total_count,
        "avg_response_time": avg_response_time,
        "resolution_rate": resolution_rate,
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

    agent_query = select(User).where(User.role.in_([UserRole.agent, UserRole.admin]))
    agent_result = await db.execute(agent_query)
    agents = agent_result.scalars().all()
    agent_ids = [a.id for a in agents]

    tickets = []
    sla_map = {}
    if agent_ids:
        tickets_query = select(Ticket).where(
            Ticket.agent_id.in_(agent_ids),
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
        )
        tickets_result = await db.execute(tickets_query)
        tickets = tickets_result.scalars().all()

        ticket_ids = [t.id for t in tickets]
        if ticket_ids:
            sla_result = await db.execute(
                select(TicketSLA).where(TicketSLA.ticket_id.in_(ticket_ids))
            )
            for sla in sla_result.scalars().all():
                sla_map[sla.ticket_id] = sla

    daily_data = defaultdict(lambda: {
        "ticket_count": 0,
        "response_times": [],
        "resolved": 0,
        "sla_ok": 0,
        "sla_total_resolved": 0,
    })

    for t in tickets:
        d = t.created_at.date()
        dd = daily_data[d]
        dd["ticket_count"] += 1

        if t.status in (TicketStatus.resolved, TicketStatus.closed):
            dd["resolved"] += 1
            dd["sla_total_resolved"] += 1
            sla = sla_map.get(t.id)
            if sla and not sla.resolution_breached:
                dd["sla_ok"] += 1

        sla = sla_map.get(t.id)
        if sla and sla.first_response_at and t.created_at:
            rt = (sla.first_response_at - t.created_at).total_seconds()
            if rt > 0:
                dd["response_times"].append(rt)

    data = []
    current = start_date
    while current <= end_date:
        dd = daily_data.get(current)
        if dd:
            avg_rt = round(sum(dd["response_times"]) / len(dd["response_times"]), 2) if dd["response_times"] else 0.0
            res_rate = round((dd["resolved"] / dd["ticket_count"] * 100), 2) if dd["ticket_count"] > 0 else 0.0
            sla_rate = round((dd["sla_ok"] / dd["sla_total_resolved"] * 100), 2) if dd["sla_total_resolved"] > 0 else 0.0
            data.append({
                "date": current.isoformat(),
                "ticket_count": dd["ticket_count"],
                "avg_response_time": avg_rt,
                "resolution_rate": res_rate,
                "sla_compliance_rate": sla_rate,
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

    agent_query = select(User).where(User.role.in_([UserRole.agent, UserRole.admin]))
    agent_result = await db.execute(agent_query)
    agents = agent_result.scalars().all()
    agent_map = {a.id: a for a in agents}
    agent_ids = list(agent_map.keys())

    agent_stats = defaultdict(lambda: {
        "ticket_count": 0,
        "response_times": [],
        "resolved": 0,
        "sla_ok": 0,
        "sla_total_resolved": 0,
    })

    if agent_ids:
        tickets_query = select(Ticket).where(
            Ticket.agent_id.in_(agent_ids),
            Ticket.created_at >= start_dt,
            Ticket.created_at <= end_dt,
        )
        tickets_result = await db.execute(tickets_query)
        tickets = tickets_result.scalars().all()

        ticket_ids = [t.id for t in tickets]
        sla_map = {}
        if ticket_ids:
            sla_result = await db.execute(
                select(TicketSLA).where(TicketSLA.ticket_id.in_(ticket_ids))
            )
            for sla in sla_result.scalars().all():
                sla_map[sla.ticket_id] = sla

        for t in tickets:
            if not t.agent_id:
                continue
            as_ = agent_stats[t.agent_id]
            as_["ticket_count"] += 1

            if t.status in (TicketStatus.resolved, TicketStatus.closed):
                as_["resolved"] += 1
                as_["sla_total_resolved"] += 1
                sla = sla_map.get(t.id)
                if sla and not sla.resolution_breached:
                    as_["sla_ok"] += 1

            sla = sla_map.get(t.id)
            if sla and sla.first_response_at and t.created_at:
                rt = (sla.first_response_at - t.created_at).total_seconds()
                if rt > 0:
                    as_["response_times"].append(rt)

    ranking_list = []
    for agent_id, as_ in agent_stats.items():
        agent = agent_map.get(agent_id)
        if not agent:
            continue
        avg_rt = round(sum(as_["response_times"]) / len(as_["response_times"]), 2) if as_["response_times"] else 0.0
        res_rate = round((as_["resolved"] / as_["ticket_count"] * 100), 2) if as_["ticket_count"] > 0 else 0.0
        sla_rate = round((as_["sla_ok"] / as_["sla_total_resolved"] * 100), 2) if as_["sla_total_resolved"] > 0 else 0.0

        ranking_list.append({
            "agent_id": agent_id,
            "agent_name": _agent_display_name(agent),
            "avatar": None,
            "department": None,
            "ticket_count": as_["ticket_count"],
            "avg_response_time": avg_rt,
            "resolution_rate": res_rate,
            "sla_compliance_rate": sla_rate,
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
