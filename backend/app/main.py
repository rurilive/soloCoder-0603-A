from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers.dashboard import router as dashboard_router
from .routers.agents import router as agents_router

app = FastAPI(title="客服数据看板 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router, prefix=settings.api_prefix)
app.include_router(agents_router, prefix=settings.api_prefix)


@app.get("/health")
def health_check():
    return {"status": "ok"}
