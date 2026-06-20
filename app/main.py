import logging
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.config import get_settings
from app.routers import auth, users, documents, annotations, collaboration
from app.middleware import MonitoringMiddleware, get_metrics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up - initializing database...")
    init_db()
    logger.info("Database initialized.")
    yield
    logger.info("Shutting down...")


app = FastAPI(title="Document Preview Service", version="2.0.0", lifespan=lifespan)

settings = get_settings()

app.add_middleware(MonitoringMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(documents.router)
app.include_router(annotations.router)
app.include_router(collaboration.router)


@app.get("/api/health")
async def health_check():
    from app.schemas import ServiceMetrics
    main_metrics = get_metrics()
    converter_status = "unavailable"
    converter_metrics = None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.converter_service_url}/health")
            if resp.status_code == 200:
                converter_status = "ok"
            metrics_resp = await client.get(f"{settings.converter_service_url}/metrics")
            if metrics_resp.status_code == 200:
                converter_metrics = metrics_resp.json()
    except Exception:
        pass
    return {
        "status": "ok",
        "version": "2.0.0",
        "main_service": ServiceMetrics(**main_metrics).model_dump(),
        "converter_service": {
            "status": converter_status,
            "metrics": converter_metrics,
        },
    }
