import asyncio
from typing import Dict, Optional
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..config import settings
from ..models import SpiderTask
from .executor import SpiderExecutor
from .proxy_pool import ProxyPoolService


class TaskScheduler:
    _instance: Optional["TaskScheduler"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.scheduler = AsyncIOScheduler(timezone="UTC")
        self._task_map: Dict[int, str] = {}
        self._initialized = True

    async def start(self):
        if not self.scheduler.running:
            self.scheduler.start()
            await self._load_scheduled_tasks()
            await self._schedule_proxy_check()

    async def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown()

    async def _load_scheduled_tasks(self):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SpiderTask).where(
                    SpiderTask.cron_expression != "",
                    SpiderTask.is_enabled == True
                )
            )
            tasks = result.scalars().all()

            for task in tasks:
                self.schedule_task(task.id, task.cron_expression)

    async def _schedule_proxy_check(self):
        async with AsyncSessionLocal() as db:
            service = ProxyPoolService(db)
            try:
                s = await service.get_settings()
                enabled = s.proxy_check_enabled
                interval = s.proxy_check_interval
            except Exception:
                enabled = settings.proxy_check_enabled
                interval = settings.proxy_check_interval

        job_id = "proxy_check_job"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
        if enabled and interval > 0:
            self.scheduler.add_job(
                self._proxy_check_job,
                trigger=IntervalTrigger(minutes=interval),
                id=job_id,
                replace_existing=True,
            )

    async def reschedule_proxy_check(self):
        await self._schedule_proxy_check()

    async def _proxy_check_job(self):
        try:
            async with AsyncSessionLocal() as db:
                service = ProxyPoolService(db)
                await service.check_all_proxies()
        except Exception as e:
            print(f"Error in proxy check job: {e}")

    def schedule_task(self, task_id: int, cron_expression: str) -> str:
        self.remove_task(task_id)

        try:
            trigger = CronTrigger.from_crontab(cron_expression, timezone="UTC")
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {e}")

        job_id = f"task_{task_id}"
        self.scheduler.add_job(
            self._execute_scheduled_task,
            trigger=trigger,
            id=job_id,
            args=[task_id],
            replace_existing=True
        )
        self._task_map[task_id] = job_id
        return job_id

    def remove_task(self, task_id: int):
        job_id = self._task_map.get(task_id)
        if job_id:
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
            del self._task_map[task_id]

    def pause_task(self, task_id: int):
        job_id = self._task_map.get(task_id)
        if job_id and self.scheduler.get_job(job_id):
            self.scheduler.pause_job(job_id)

    def resume_task(self, task_id: int):
        job_id = self._task_map.get(task_id)
        if job_id and self.scheduler.get_job(job_id):
            self.scheduler.resume_job(job_id)

    def get_next_run_time(self, task_id: int) -> Optional[datetime]:
        job_id = self._task_map.get(task_id)
        if job_id:
            job = self.scheduler.get_job(job_id)
            if job:
                return job.next_run_time
        return None

    def get_scheduled_tasks(self) -> Dict[int, str]:
        return dict(self._task_map)

    async def _execute_scheduled_task(self, task_id: int):
        async with AsyncSessionLocal() as db:
            executor = SpiderExecutor(db)
            try:
                await executor.execute_task(task_id)
            except Exception as e:
                print(f"Error executing scheduled task {task_id}: {e}")


scheduler = TaskScheduler()
