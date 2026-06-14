from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import ExecuteRequest
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
async def execute_code(data: dict, db: AsyncSession = Depends(get_db)):
    code = data.get("code", "")
    scrape_rules = data.get("scrape_rules")

    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    executor = SpiderExecutor(db)
    from ..schemas import ScrapeRules
    rules = ScrapeRules(**scrape_rules) if scrape_rules else None

    return await executor.execute_code(code, rules)
