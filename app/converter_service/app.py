import os
import time
import asyncio
import logging
from typing import Optional
from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.converter_service.engine import (
    convert_document,
    search_pdf_text,
    get_pdf_page_count,
    ensure_dirs,
    is_allowed_file,
)

logger = logging.getLogger(__name__)

CONVERT_UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads")
CONVERT_PREVIEW_DIR = os.environ.get("PREVIEW_DIR", "./previews")

_tasks: dict[str, dict] = {}
_metrics = {
    "total_conversions": 0,
    "successful_conversions": 0,
    "failed_conversions": 0,
    "total_conversion_seconds": 0.0,
    "start_time": time.time(),
}


class ConvertRequest(BaseModel):
    file_path: str
    file_type: str
    filename: str
    watermark_text: Optional[str] = None
    use_pdf_native: bool = False


class SearchRequest(BaseModel):
    file_path: str
    query: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    preview_name: Optional[str] = None
    preview_path: Optional[str] = None
    preview_type: Optional[str] = None
    error_message: Optional[str] = None


class MetricsResponse(BaseModel):
    uptime_seconds: float
    total_conversions: int
    successful_conversions: int
    failed_conversions: int
    avg_conversion_seconds: Optional[float] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_dirs(CONVERT_UPLOAD_DIR, CONVERT_PREVIEW_DIR)
    logger.info("Converter service started.")
    yield
    logger.info("Converter service shutting down.")


app = FastAPI(title="Document Converter Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _run_conversion(task_id: str, req: ConvertRequest):
    task = _tasks[task_id]
    task["status"] = "running"
    task["started_at"] = time.time()
    start = time.time()
    try:
        def progress_cb(pct: int):
            task["progress"] = pct

        cb = progress_cb if req.file_type == "pdf" and not req.use_pdf_native else None
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            convert_document,
            req.file_path,
            req.file_type,
            CONVERT_PREVIEW_DIR,
            req.watermark_text,
            req.use_pdf_native,
            cb,
        )
        if result is None:
            raise ValueError("Unsupported file type for conversion")
        preview_name, preview_path, preview_type = result
        task["status"] = "completed"
        task["progress"] = 100
        task["preview_name"] = preview_name
        task["preview_path"] = preview_path
        task["preview_type"] = preview_type
        task["completed_at"] = time.time()
        _metrics["successful_conversions"] += 1
        elapsed = time.time() - start
        _metrics["total_conversion_seconds"] += elapsed
    except Exception as e:
        logger.error(f"Conversion task {task_id} failed: {e}")
        task["status"] = "failed"
        task["error_message"] = str(e)
        task["completed_at"] = time.time()
        _metrics["failed_conversions"] += 1
    finally:
        _metrics["total_conversions"] += 1


@app.post("/convert", response_model=TaskStatusResponse)
async def create_convert_task(req: ConvertRequest):
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail="Source file not found")
    task_id = f"conv_{int(time.time() * 1000)}_{id(req)}"
    _tasks[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "progress": 0,
        "preview_name": None,
        "preview_path": None,
        "preview_type": None,
        "error_message": None,
        "started_at": None,
        "completed_at": None,
    }
    asyncio.create_task(_run_conversion(task_id, req))
    return TaskStatusResponse(**_tasks[task_id])


@app.get("/convert/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskStatusResponse(**task)


@app.post("/search")
async def search_pdf(req: SearchRequest):
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail="File not found")
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    results = await asyncio.get_event_loop().run_in_executor(
        None, search_pdf_text, req.file_path, req.query.strip()
    )
    return {
        "query": req.query.strip(),
        "total_matches": len(results),
        "results": results,
    }


@app.get("/pdf/page-count")
async def pdf_page_count(file_path: str):
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="File not found")
    from app.converter_service.engine import get_extension
    if get_extension(file_path) != "pdf":
        raise HTTPException(status_code=400, detail="Not a PDF file")
    import fitz
    doc = fitz.open(file_path)
    count = doc.page_count
    doc.close()
    return {"total_pages": count}


@app.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    avg = None
    if _metrics["successful_conversions"] > 0:
        avg = _metrics["total_conversion_seconds"] / _metrics["successful_conversions"]
    return MetricsResponse(
        uptime_seconds=time.time() - _metrics["start_time"],
        total_conversions=_metrics["total_conversions"],
        successful_conversions=_metrics["successful_conversions"],
        failed_conversions=_metrics["failed_conversions"],
        avg_conversion_seconds=avg,
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "converter"}
