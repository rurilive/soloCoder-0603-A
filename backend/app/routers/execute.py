from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import ExecuteRequest, ExecuteCodeRequest
from ..services.executor import SpiderExecutor

router = APIRouter(prefix="/api/execute", tags=["execute"])


@router.post("")
async def execute_spider(data: ExecuteRequest, db: AsyncSession = Depends(get_db)):
    executor = SpiderExecutor(db)

    if data.task_id:
        return await executor.execute_task(data.task_id)
    elif data.script_id:
        return await executor.execute_script(data.script_id, data.scrape_rules)
    else:
        raise HTTPException(
            status_code=400,
            detail="Either task_id or script_id must be provided"
        )


@router.post("/code")
async def execute_code(data: ExecuteCodeRequest, db: AsyncSession = Depends(get_db)):
    if not data.code.strip():
        raise HTTPException(status_code=400, detail="Code is required")

    executor = SpiderExecutor(db)
    return await executor.execute_code(data.code, data.scrape_rules)
