from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..services.dashboard_service import (
    get_personal_stats,
    get_personal_trend,
    get_team_overview,
    get_team_trend,
    get_team_ranking,
    refresh_materialized_views,
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
def personal_dashboard(
    agent_id: int,
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    db: Session = Depends(get_db),
):
    try:
        return get_personal_stats(db, agent_id, period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/personal/{agent_id}/trend", response_model=PersonalTrendResponse)
def personal_trend(
    agent_id: int,
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    db: Session = Depends(get_db),
):
    try:
        return get_personal_trend(db, agent_id, period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/overview", response_model=TeamOverview)
def team_overview(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    db: Session = Depends(get_db),
):
    try:
        return get_team_overview(db, period, department)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/trend", response_model=TeamTrendResponse)
def team_trend(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    db: Session = Depends(get_db),
):
    try:
        return get_team_trend(db, period, department)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/ranking", response_model=TeamRankingResponse)
def team_ranking(
    period: str = Query("month", regex="^(day|week|month|quarter)$"),
    department: Optional[str] = Query("all"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        return get_team_ranking(db, period, department, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
def refresh_views(db: Session = Depends(get_db)):
    try:
        return refresh_materialized_views(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
