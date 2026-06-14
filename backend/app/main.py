from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .database import init_db
from .services.scheduler import scheduler
from .routers import scripts, tasks, execute, results, visual_config, debug, cleaning, proxies


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await scheduler.start()
    yield
    await scheduler.shutdown()


app = FastAPI(
    title=settings.app_name,
    description="爬虫任务管理平台 - 支持Python爬虫脚本编写、定时调度和结果导出",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scripts.router)
app.include_router(tasks.router)
app.include_router(execute.router)
app.include_router(results.router)
app.include_router(visual_config.router)
app.include_router(debug.router)
app.include_router(cleaning.router)
app.include_router(proxies.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )
