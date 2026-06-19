import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.database import async_session
from app.sla_service import scan_all_active_tickets_sla

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _sla_scan_job():
    try:
        async with async_session() as db:
            result = await scan_all_active_tickets_sla(db)
            if result["total_scanned"] > 0:
                logger.info(
                    f"SLA scan completed: scanned={result['total_scanned']}, "
                    f"response_breached={result['response_breached']}, "
                    f"resolution_breached={result['resolution_breached']}, "
                    f"auto_escalated={result['auto_escalated']}, "
                    f"warnings_sent={result['warnings_sent']}"
                )
            else:
                logger.debug("SLA scan completed: no active tickets")
    except Exception:
        logger.exception("Error in SLA scan job")


def start_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")

    _scheduler.add_job(
        _sla_scan_job,
        trigger=IntervalTrigger(minutes=1),
        id="sla_scan_job",
        name="SLA Scan Job",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    _scheduler.start()
    logger.info("APScheduler started with SLA scan job (every 1 minute)")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
        _scheduler = None


def get_scheduler() -> AsyncIOScheduler | None:
    return _scheduler
