from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import schemas
from ..config import settings
from ..services.proxy_pool import ProxyPoolService
from ..services.scheduler import scheduler

router = APIRouter(prefix="/api/proxies", tags=["proxies"])


@router.get("", response_model=dict)
async def list_proxies(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    protocol: Optional[str] = None,
    tag: Optional[str] = None,
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    service = ProxyPoolService(db)
    items, total = await service.list_proxies(
        skip=skip, limit=limit, status=status, protocol=protocol, tag=tag, keyword=keyword
    )
    return {
        "items": [schemas.Proxy.model_validate(p) for p in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("", response_model=schemas.Proxy)
async def create_proxy(data: schemas.ProxyCreate, db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    proxy = await service.create_proxy(data.model_dump())
    return schemas.Proxy.model_validate(proxy)


@router.get("/stats", response_model=schemas.ProxyStats)
async def get_proxy_stats(db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    return await service.get_stats()


@router.get("/settings", response_model=schemas.ProxySettings)
async def get_proxy_settings(db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    return await service.get_settings()


@router.put("/settings", response_model=schemas.ProxySettings)
async def update_proxy_settings(
    data: schemas.ProxySettings, db: AsyncSession = Depends(get_db)
):
    service = ProxyPoolService(db)
    saved = await service.save_settings(data)
    await scheduler.reschedule_proxy_check()
    return saved


@router.post("/batch", response_model=dict)
async def batch_import_proxies(
    data: schemas.BatchImportRequest, db: AsyncSession = Depends(get_db)
):
    service = ProxyPoolService(db)
    count, skipped = await service.batch_import(data.text)
    return {"imported": count, "skipped": skipped, "total": count + len(skipped)}


@router.delete("/batch", response_model=dict)
async def batch_delete_proxies(
    data: schemas.BatchDeleteRequest, db: AsyncSession = Depends(get_db)
):
    service = ProxyPoolService(db)
    count = await service.batch_delete(data.ids)
    return {"deleted": count}


@router.post("/batch-check", response_model=schemas.BatchCheckResponse)
async def batch_check_proxies(
    data: schemas.BatchCheckRequest, db: AsyncSession = Depends(get_db)
):
    service = ProxyPoolService(db)
    result = await service.check_all_proxies(
        ids=data.ids, status=data.status, protocol=data.protocol, tags=data.tags
    )
    return schemas.BatchCheckResponse(**result)


@router.get("/check-logs/{proxy_id}", response_model=dict)
async def get_check_logs(
    proxy_id: int,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    service = ProxyPoolService(db)
    logs, total = await service.get_check_logs(proxy_id, skip=skip, limit=limit)
    return {
        "items": [schemas.ProxyCheckLog.model_validate(l) for l in logs],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{proxy_id}", response_model=schemas.Proxy)
async def get_proxy(proxy_id: int, db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    proxy = await service.get_proxy(proxy_id)
    if not proxy:
        raise HTTPException(status_code=404, detail="Proxy not found")
    return schemas.Proxy.model_validate(proxy)


@router.put("/{proxy_id}", response_model=schemas.Proxy)
async def update_proxy(
    proxy_id: int, data: schemas.ProxyUpdate, db: AsyncSession = Depends(get_db)
):
    service = ProxyPoolService(db)
    proxy = await service.update_proxy(proxy_id, data.model_dump(exclude_unset=True))
    if not proxy:
        raise HTTPException(status_code=404, detail="Proxy not found")
    return schemas.Proxy.model_validate(proxy)


@router.delete("/{proxy_id}", response_model=dict)
async def delete_proxy(proxy_id: int, db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    ok = await service.delete_proxy(proxy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Proxy not found")
    return {"success": True}


@router.post("/{proxy_id}/check", response_model=schemas.CheckResult)
async def check_proxy(proxy_id: int, db: AsyncSession = Depends(get_db)):
    service = ProxyPoolService(db)
    result = await service.check_proxy(proxy_id)
    if "error" in result and not result.get("success", False) and result.get("proxy_id") is None:
        raise HTTPException(status_code=404, detail=result["error"])
    return schemas.CheckResult(**result)


@router.post("/{proxy_id}/report", response_model=dict)
async def report_proxy(
    proxy_id: int,
    data: schemas.ReportProxyRequest,
    db: AsyncSession = Depends(get_db),
):
    service = ProxyPoolService(db)
    proxy = await service.get_proxy(proxy_id)
    if not proxy:
        raise HTTPException(status_code=404, detail="Proxy not found")
    await service.report_proxy_result(proxy_id, data.success, data.response_time)
    return {"success": True}
