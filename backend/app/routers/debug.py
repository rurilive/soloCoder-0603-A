from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ..database import get_db
from ..models import DebugSession
from ..schemas import (
    DebugSessionCreate,
    DebugCommand,
    DebugSessionState,
    DebugSession as DebugSessionSchema,
)
from ..services.debugger import DebugService

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/sessions", response_model=List[DebugSessionSchema])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DebugSession).order_by(DebugSession.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=DebugSessionSchema)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    debug_service = DebugService(db)
    session = await debug_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions", response_model=DebugSessionSchema)
async def create_session(
    data: DebugSessionCreate, db: AsyncSession = Depends(get_db)
):
    debug_service = DebugService(db)
    session = await debug_service.create_session(
        code=data.code,
        scrape_rules=data.scrape_rules,
        script_id=data.script_id,
    )
    return session


@router.post("/sessions/{session_id}/start", response_model=DebugSessionState)
async def start_session(session_id: str, db: AsyncSession = Depends(get_db)):
    debug_service = DebugService(db)
    try:
        return await debug_service.start_debugging(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/command", response_model=DebugSessionState)
async def execute_command(
    session_id: str, data: DebugCommand, db: AsyncSession = Depends(get_db)
):
    debug_service = DebugService(db)
    try:
        return await debug_service.execute_command(
            session_id, data.command, data.breakpoints
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/state", response_model=DebugSessionState)
async def get_session_state(session_id: str, db: AsyncSession = Depends(get_db)):
    debug_service = DebugService(db)
    try:
        return await debug_service.get_state(session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, db: AsyncSession = Depends(get_db)):
    debug_service = DebugService(db)
    try:
        await debug_service.stop_session(session_id)
        return {"message": "Session stopped"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
