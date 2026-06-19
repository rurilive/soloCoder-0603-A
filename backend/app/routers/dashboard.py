from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from ..database import get_db
from ..services.dashboard_service import (
    get_personal_stats,
    get_personal_trend,
    get_team_overview,
    get_team_trend,
    get_team_ranking,
    refresh_cache,
)
from ..schemas import (
    PersonalStats,
    PersonalTrendResponse,
    TeamOverview,
    TeamTrendResponse,
    TeamRankingResponse,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/personal/{agent_id}", response_model=PersonalStats)
async def personal_dashboard(
    agent_id: int,
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_personal_stats(db, agent_id, period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/personal/{agent_id}/trend", response_model=PersonalTrendResponse)
async def personal_trend(
    agent_id: int,
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_personal_trend(db, agent_id, period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/overview", response_model=TeamOverview)
async def team_overview(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_team_overview(db, period, department)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/trend", response_model=TeamTrendResponse)
async def team_trend(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_team_trend(db, period, department)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/ranking", response_model=TeamRankingResponse)
async def team_ranking(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_team_ranking(db, period, department, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def refresh():
    try:
        return await refresh_cache()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
