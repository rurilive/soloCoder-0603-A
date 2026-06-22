import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from .core.config import settings
from .core.database import init_db
from .routers import api_router
from .seed import seed_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_data()
    static_dir = Path(settings.STATIC_SITE_OUTPUT_DIR)
    static_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Multi-lingual Content Management System API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)

_static_site_dir = Path(settings.STATIC_SITE_OUTPUT_DIR)
if _static_site_dir.exists():
    app.mount("/site", StaticFiles(directory=str(_static_site_dir), html=True), name="static_site")


@app.get("/")
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "api_prefix": settings.API_V1_PREFIX,
        "supported_languages": settings.SUPPORTED_LANGUAGES,
        "static_site_url": "/site/" if _static_site_dir.exists() else None,
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
