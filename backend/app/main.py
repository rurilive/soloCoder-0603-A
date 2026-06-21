from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .core.config import settings
from .core.database import init_db
from .routers import api_router
from .seed import seed_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_data()
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


@app.get("/")
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "api_prefix": settings.API_V1_PREFIX,
        "supported_languages": settings.SUPPORTED_LANGUAGES,
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
