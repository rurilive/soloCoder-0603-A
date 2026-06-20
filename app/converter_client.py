import logging
import httpx
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_timeout = httpx.Timeout(30.0, connect=5.0)


async def submit_convert_task(
    file_path: str,
    file_type: str,
    filename: str,
    watermark_text: Optional[str] = None,
    use_pdf_native: bool = False,
) -> dict:
    async with httpx.AsyncClient(timeout=_timeout) as client:
        payload = {
            "file_path": file_path,
            "file_type": file_type,
            "filename": filename,
            "watermark_text": watermark_text,
            "use_pdf_native": use_pdf_native,
        }
        resp = await client.post(f"{settings.converter_service_url}/convert", json=payload)
        resp.raise_for_status()
        return resp.json()


async def get_convert_task_status(task_id: str) -> dict:
    async with httpx.AsyncClient(timeout=_timeout) as client:
        resp = await client.get(f"{settings.converter_service_url}/convert/{task_id}")
        resp.raise_for_status()
        return resp.json()


async def search_pdf_text(file_path: str, query: str) -> dict:
    async with httpx.AsyncClient(timeout=_timeout) as client:
        payload = {"file_path": file_path, "query": query}
        resp = await client.post(f"{settings.converter_service_url}/search", json=payload)
        resp.raise_for_status()
        return resp.json()


async def get_converter_metrics() -> dict:
    async with httpx.AsyncClient(timeout=_timeout) as client:
        resp = await client.get(f"{settings.converter_service_url}/metrics")
        resp.raise_for_status()
        return resp.json()
