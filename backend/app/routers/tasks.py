from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import List
from datetime import datetime

from ..database import get_db
from ..models import SpiderTask, SpiderScript
from ..schemas import SpiderTaskCreate, SpiderTaskUpdate, SpiderTask as TaskSchema
from ..services.scheduler import scheduler

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=List[TaskSchema])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpiderTask)
        .options(joinedload(SpiderTask.script))
        .order_by(SpiderTask.updated_at.desc())
    )
    tasks = result.scalars().unique().all()

    for task in tasks:
        next_run = scheduler.get_next_run_time(task.id)
        if next_run:
            task.next_run_time = next_run

    return tasks


@router.get("/{task_id}", response_model=TaskSchema)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SpiderTask)
        .options(joinedload(SpiderTask.script))
        .where(SpiderTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskSchema)
async def create_task(data: SpiderTaskCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderScript).where(SpiderScript.id == data.script_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Script not found")

    task_data = data.model_dump()
    task_data["scrape_rules"] = data.scrape_rules.model_dump()

    task = SpiderTask(**task_data)
    db.add(task)
    await db.commit()
    await db.refresh(task)

    if task.cron_expression and task.is_enabled:
        try:
            scheduler.schedule_task(task.id, task.cron_expression)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    result = await db.execute(
        select(SpiderTask)
        .options(joinedload(SpiderTask.script))
        .where(SpiderTask.id == task.id)
    )
    return result.scalar_one()


@router.put("/{task_id}", response_model=TaskSchema)
async def update_task(task_id: int, data: SpiderTaskUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderTask).where(SpiderTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = data.model_dump(exclude_unset=True)
    if "scrape_rules" in update_data and update_data["scrape_rules"]:
        update_data["scrape_rules"] = update_data["scrape_rules"].model_dump()

    for key, value in update_data.items():
        setattr(task, key, value)

    task.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)

    if task.cron_expression:
        if task.is_enabled:
            try:
                scheduler.schedule_task(task.id, task.cron_expression)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            scheduler.pause_task(task.id)
    else:
        scheduler.remove_task(task.id)

    result = await db.execute(
        select(SpiderTask)
        .options(joinedload(SpiderTask.script))
        .where(SpiderTask.id == task_id)
    )
    return result.scalar_one()


@router.delete("/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderTask).where(SpiderTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    scheduler.remove_task(task_id)
    await db.delete(task)
    await db.commit()
    return {"message": "Task deleted successfully"}


@router.post("/{task_id}/run")
async def run_task(task_id: int, db: AsyncSession = Depends(get_db)):
    from ..services.executor import SpiderExecutor

    result = await db.execute(select(SpiderTask).where(SpiderTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    executor = SpiderExecutor(db)
    execution_result = await executor.execute_task(task_id)
    return execution_result


@router.post("/{task_id}/toggle")
async def toggle_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderTask).where(SpiderTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.is_enabled = not task.is_enabled
    task.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)

    if task.cron_expression:
        if task.is_enabled:
            scheduler.resume_task(task_id)
        else:
            scheduler.pause_task(task_id)

    return {"id": task.id, "is_enabled": task.is_enabled}
