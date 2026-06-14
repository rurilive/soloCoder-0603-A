from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from typing import List, Optional
from datetime import datetime
import io
import csv
import json

from ..database import get_db
from ..models import SpiderJob, SpiderResult, SpiderTask
from ..schemas import SpiderJob as JobSchema, SpiderResult as ResultSchema

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/jobs", response_model=List[JobSchema])
async def list_jobs(
    task_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    query = select(SpiderJob).options(
        joinedload(SpiderJob.task).joinedload(SpiderTask.script)
    )
    if task_id:
        query = query.where(SpiderJob.task_id == task_id)
    if status:
        query = query.where(SpiderJob.status == status)

    query = query.order_by(SpiderJob.started_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().unique().all()


@router.get("/jobs/{job_id}", response_model=JobSchema)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpiderJob)
        .options(joinedload(SpiderJob.task).joinedload(SpiderTask.script))
        .where(SpiderJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs/{job_id}/results", response_model=List[ResultSchema])
async def get_job_results(
    job_id: int,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(SpiderJob).where(SpiderJob.id == job_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    query = select(SpiderResult).where(SpiderResult.job_id == job_id)\
        .order_by(SpiderResult.created_at.desc())\
        .offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/jobs/{job_id}/export/{format}")
async def export_results(
    job_id: int,
    format: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(SpiderJob).where(SpiderJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    query = select(SpiderResult).where(SpiderResult.job_id == job_id)\
        .order_by(SpiderResult.created_at.asc())
    result = await db.execute(query)
    results = result.scalars().all()

    if format == "json":
        return await _export_json(job, results)
    elif format == "csv":
        return await _export_csv(job, results)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'csv'")


async def _export_json(job: SpiderJob, results: List[SpiderResult]):
    data = {
        "job_id": job.id,
        "task_id": job.task_id,
        "status": job.status,
        "started_at": job.started_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "duration": job.duration,
        "items_scraped": job.items_scraped,
        "results": [
            {
                "id": r.id,
                "url": r.url,
                "data": r.data,
                "created_at": r.created_at.isoformat()
            }
            for r in results
        ]
    }

    output = json.dumps(data, ensure_ascii=False, indent=2)
    filename = f"job_{job.id}_results.json"

    return StreamingResponse(
        iter([output]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


async def _export_csv(job: SpiderJob, results: List[SpiderResult]):
    output = io.StringIO()
    writer = csv.writer(output)

    all_keys = set()
    for r in results:
        if isinstance(r.data, dict):
            all_keys.update(r.data.keys())

    headers = ["id", "url", "created_at"] + sorted(all_keys)
    writer.writerow(headers)

    for r in results:
        row = [r.id, r.url, r.created_at.isoformat()]
        data = r.data if isinstance(r.data, dict) else {}
        for key in sorted(all_keys):
            row.append(data.get(key, ""))
        writer.writerow(row)

    output.seek(0)
    filename = f"job_{job.id}_results.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count(SpiderJob.id)))
    total_jobs = result.scalar()

    result = await db.execute(
        select(func.count(SpiderJob.id)).where(SpiderJob.status == "completed")
    )
    completed_jobs = result.scalar()

    result = await db.execute(
        select(func.count(SpiderJob.id)).where(SpiderJob.status == "running")
    )
    running_jobs = result.scalar()

    result = await db.execute(
        select(func.count(SpiderJob.id)).where(SpiderJob.status == "failed")
    )
    failed_jobs = result.scalar()

    result = await db.execute(select(func.sum(SpiderJob.items_scraped)))
    total_items = result.scalar() or 0

    result = await db.execute(select(func.count(SpiderTask.id)))
    total_tasks = result.scalar()

    result = await db.execute(
        select(func.count(SpiderTask.id)).where(SpiderTask.is_enabled == True)
    )
    enabled_tasks = result.scalar()

    return {
        "jobs": {
            "total": total_jobs,
            "completed": completed_jobs,
            "running": running_jobs,
            "failed": failed_jobs
        },
        "items_scraped": total_items,
        "tasks": {
            "total": total_tasks,
            "enabled": enabled_tasks
        }
    }
