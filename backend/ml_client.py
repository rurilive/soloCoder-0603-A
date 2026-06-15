import httpx
import asyncio
from typing import Optional
from schemas import MLReviewResult, CategoryScore
import logging

logger = logging.getLogger(__name__)

ML_API_BASE_URL = "http://127.0.0.1:1113"
ML_API_TIMEOUT = 5.0


class MLClient:
    def __init__(self, base_url: str = ML_API_BASE_URL, timeout: float = ML_API_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def review(self, title: str, body: str, image_url: Optional[str] = None) -> Optional[MLReviewResult]:
        client = self._get_client()
        try:
            resp = await client.post(
                f"{self.base_url}/api/v1/review",
                json={"title": title, "body": body, "image_url": image_url}
            )
            if resp.status_code != 200:
                logger.warning(f"ML API returned status {resp.status_code}: {resp.text}")
                return None
            data = resp.json()
            return MLReviewResult(
                model_version=data.get("model_version", ""),
                overall_score=float(data.get("overall_score", 0.0)),
                is_safe=bool(data.get("is_safe", True)),
                confidence=float(data.get("confidence", 0.0)),
                category_scores=[
                    CategoryScore(category=cs["category"], score=float(cs["score"]))
                    for cs in data.get("category_scores", [])
                ],
                detected_topics=list(data.get("detected_topics", [])),
                processing_time_ms=int(data.get("processing_time_ms", 0))
            )
        except Exception as e:
            logger.error(f"ML API调用失败: {e}")
            return None

    async def health(self) -> bool:
        client = self._get_client()
        try:
            resp = await client.get(f"{self.base_url}/api/v1/health")
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


_ml_client_singleton: Optional[MLClient] = None


def get_ml_client() -> MLClient:
    global _ml_client_singleton
    if _ml_client_singleton is None:
        _ml_client_singleton = MLClient()
    return _ml_client_singleton
