import logging
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import Registration
from .api.registrations import handle_waitlist_timeout
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

def check_and_process_timeouts():
    db = SessionLocal()
    try:
        expired_offers = db.query(Registration).filter(
            Registration.status == "pending_confirmation",
            Registration.waitlist_offer_sent_at < datetime.utcnow() - timedelta(hours=24)
        ).all()
        
        if expired_offers:
            logger.info(f"Found {len(expired_offers)} expired waitlist offers to process")
        
        for registration in expired_offers:
            logger.info(f"Processing timeout for registration {registration.id}")
            handle_waitlist_timeout(registration, db)
        
    except Exception as e:
        logger.error(f"Error processing timeouts: {str(e)}")
    finally:
        db.close()

def start_scheduler():
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(check_and_process_timeouts, 'interval', minutes=10)
    scheduler.start()
    logger.info("Scheduler started. Checking for expired waitlist offers every 10 minutes.")
    return scheduler