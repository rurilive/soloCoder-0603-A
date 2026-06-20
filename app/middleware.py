import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_metrics = {
    "total_requests": 0,
    "total_conversions": 0,
    "successful_conversions": 0,
    "failed_conversions": 0,
    "total_conversion_seconds": 0.0,
    "slow_requests": 0,
    "start_time": time.time(),
    "status_codes": {},
    "endpoint_times": {},
}


def record_conversion(success: bool, elapsed_seconds: float):
    _metrics["total_conversions"] += 1
    if success:
        _metrics["successful_conversions"] += 1
    else:
        _metrics["failed_conversions"] += 1
    _metrics["total_conversion_seconds"] += elapsed_seconds


def get_metrics() -> dict:
    avg = None
    if _metrics["successful_conversions"] > 0:
        avg = _metrics["total_conversion_seconds"] / _metrics["successful_conversions"]
    return {
        "uptime_seconds": round(time.time() - _metrics["start_time"], 1),
        "total_requests": _metrics["total_requests"],
        "total_conversions": _metrics["total_conversions"],
        "successful_conversions": _metrics["successful_conversions"],
        "failed_conversions": _metrics["failed_conversions"],
        "avg_conversion_seconds": round(avg, 3) if avg else None,
        "slow_requests": _metrics["slow_requests"],
        "status_codes": dict(_metrics["status_codes"]),
        "top_slow_endpoints": dict(
            sorted(_metrics["endpoint_times"].items(), key=lambda x: x[1], reverse=True)[:10]
        ),
    }


class MonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.time()
        response = await call_next(request)
        elapsed = time.time() - start

        _metrics["total_requests"] += 1
        status_code = response.status_code
        _metrics["status_codes"][str(status_code)] = _metrics["status_codes"].get(str(status_code), 0) + 1

        path = request.url.path
        if path not in _metrics["endpoint_times"]:
            _metrics["endpoint_times"][path] = 0.0
        _metrics["endpoint_times"][path] += elapsed

        if elapsed > settings.slow_request_threshold_seconds:
            _metrics["slow_requests"] += 1
            logger.warning(
                f"Slow request: {request.method} {path} "
                f"took {elapsed:.3f}s (threshold={settings.slow_request_threshold_seconds}s)"
            )

        response.headers["X-Process-Time"] = f"{elapsed:.4f}"
        return response
