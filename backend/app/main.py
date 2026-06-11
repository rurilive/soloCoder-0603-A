import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import hotels, bookings, orders, admin, pricing, reviews, captcha
from .tasks import release_expired_locks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

background_task = None

async def periodic_release_expired_locks():
    while True:
        try:
            count = release_expired_locks()
            if count > 0:
                logger.info(f"Released {count} expired locked orders")
        except Exception as e:
            logger.error(f"Error releasing expired locks: {e}")
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_task
    background_task = asyncio.create_task(periodic_release_expired_locks())
    logger.info("Started background task for releasing expired locks")
    yield
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            logger.info("Background task cancelled")

app = FastAPI(title="酒店预订系统 API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hotels.router, prefix="/api")
app.include_router(bookings.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(pricing.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(captcha.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "酒店预订系统 API"}