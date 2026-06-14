import re
import random
import time
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from urllib.parse import urlparse

import httpx
try:
    from httpx_socks import AsyncProxyTransport
except ImportError:
    AsyncProxyTransport = None
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, case, column, exists
from sqlalchemy.types import String
from sqlalchemy.orm import joinedload

from ..config import settings
from ..models import Proxy, ProxyCheckLog, SystemSetting
from ..schemas import ProxyStats, ProxySettings

logger = logging.getLogger(__name__)


class ProxyPoolService:
    _round_robin_counters: Dict[str, int] = {}

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _build_proxy_dict(proxy: Proxy) -> Dict[str, Any]:
        auth = ""
        if proxy.username:
            auth = f"{proxy.username}"
            if proxy.password:
                auth += f":{proxy.password}"
            auth += "@"

        proxy_url = f"{proxy.protocol}://{auth}{proxy.ip}:{proxy.port}"

        proxies = {}
        if proxy.protocol == "socks5":
            proxies = {
                "http://": proxy_url,
                "https://": proxy_url,
            }
        else:
            proxies = {
                "http://": proxy_url,
                "https://": proxy_url,
            }

        return {
            "id": proxy.id,
            "ip": proxy.ip,
            "port": proxy.port,
            "protocol": proxy.protocol,
            "proxy_url": proxy_url,
            "proxies": proxies,
            "response_time": proxy.response_time or 0,
            "success_count": proxy.success_count or 0,
            "fail_count": proxy.fail_count or 0,
            "tags": proxy.tags or [],
        }

    async def list_proxies(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        protocol: Optional[str] = None,
        tag: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> Tuple[List[Proxy], int]:
        base_conditions = []
        tag_condition = None

        if status:
            base_conditions.append(Proxy.status == status)
        if protocol:
            base_conditions.append(Proxy.protocol == protocol)
        if keyword:
            like = f"%{keyword}%"
            base_conditions.append(or_(Proxy.ip.like(like), Proxy.remark.like(like)))
        if tag:
            json_each = func.json_each(Proxy.tags).table_valued(
                column("value", String)
            )
            tag_condition = exists(
                select(1)
                .select_from(json_each)
                .where(column("value") == tag)
                .correlate(Proxy)
            )

        base_query = select(Proxy)
        if base_conditions:
            base_query = base_query.where(*base_conditions)

        full_query = base_query
        if tag_condition is not None:
            full_query = full_query.where(tag_condition)

        try:
            count_query = select(func.count()).select_from(full_query.subquery())
            result = await self.db.execute(count_query)
            total = result.scalar() or 0

            data_query = full_query.order_by(Proxy.id.desc()).offset(skip).limit(limit)
            result = await self.db.execute(data_query)
            items = result.scalars().all()
        except Exception as _e:
            logger.warning(
                "list_proxies 使用 sql json_each 标签过滤执行失败，降级为不过滤：%s", _e
            )
            count_query = select(func.count()).select_from(base_query.subquery())
            result = await self.db.execute(count_query)
            total = result.scalar() or 0

            data_query = base_query.order_by(Proxy.id.desc()).offset(skip).limit(limit)
            result = await self.db.execute(data_query)
            items = result.scalars().all()

        return list(items), total

    async def get_proxy(self, proxy_id: int) -> Optional[Proxy]:
        result = await self.db.execute(select(Proxy).where(Proxy.id == proxy_id))
        return result.scalar_one_or_none()

    async def create_proxy(self, data: Dict[str, Any]) -> Proxy:
        proxy = Proxy(**data)
        self.db.add(proxy)
        await self.db.commit()
        await self.db.refresh(proxy)
        return proxy

    async def update_proxy(self, proxy_id: int, data: Dict[str, Any]) -> Optional[Proxy]:
        proxy = await self.get_proxy(proxy_id)
        if not proxy:
            return None
        for key, value in data.items():
            setattr(proxy, key, value)
        await self.db.commit()
        await self.db.refresh(proxy)
        return proxy

    async def delete_proxy(self, proxy_id: int) -> bool:
        proxy = await self.get_proxy(proxy_id)
        if not proxy:
            return False
        await self.db.delete(proxy)
        await self.db.commit()
        return True

    async def batch_delete(self, ids: List[int]) -> int:
        result = await self.db.execute(select(Proxy).where(Proxy.id.in_(ids)))
        proxies = result.scalars().all()
        count = 0
        for p in proxies:
            await self.db.delete(p)
            count += 1
        await self.db.commit()
        return count

    @staticmethod
    def parse_proxy_string(text: str) -> List[Dict[str, Any]]:
        results = []
        seen = set()
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        patterns = [
            re.compile(
                r"^(?P<protocol>socks5|https?|SOCKS5|HTTPS?)://"
                r"(?:(?P<user>[^:@]+):(?P<pass>[^@]*)@)?"
                r"(?P<ip>[\d\.]+|\[[\da-fA-F:]+\]|[a-zA-Z0-9\-\.]+):"
                r"(?P<port>\d+)$"
            ),
            re.compile(
                r"^(?P<ip>[\d\.]+|\[[\da-fA-F:]+\]|[a-zA-Z0-9\-\.]+):"
                r"(?P<port>\d+)$"
            ),
            re.compile(
                r"^(?P<protocol>socks5|https?|SOCKS5|HTTPS?)://"
                r"(?P<ip>[\d\.]+|\[[\da-fA-F:]+\]|[a-zA-Z0-9\-\.]+):"
                r"(?P<port>\d+)$"
            ),
        ]

        for line in lines:
            matched = False
            for pattern in patterns:
                m = pattern.match(line)
                if m:
                    d = m.groupdict()
                    protocol = (d.get("protocol") or "http").lower()
                    if protocol not in ("http", "https", "socks5"):
                        protocol = "http"
                    ip = d["ip"].strip("[]")
                    port = int(d["port"])
                    username = d.get("user") or None
                    password = d.get("pass") or None
                    key = (protocol, ip, port, username, password)
                    if key not in seen:
                        seen.add(key)
                        results.append({
                            "protocol": protocol,
                            "ip": ip,
                            "port": port,
                            "username": username,
                            "password": password,
                            "status": "inactive",
                            "tags": [],
                            "remark": "",
                        })
                    matched = True
                    break
            if not matched:
                continue

        return results

    async def batch_import(self, text: str) -> Tuple[int, List[Dict[str, Any]]]:
        parsed = self.parse_proxy_string(text)
        existing_keys = set()

        result = await self.db.execute(select(Proxy))
        for p in result.scalars().all():
            existing_keys.add((p.protocol, p.ip, p.port, p.username, p.password))

        imported = []
        skipped = []
        for item in parsed:
            key = (item["protocol"], item["ip"], item["port"], item["username"], item["password"])
            if key in existing_keys:
                skipped.append({"proxy": item, "reason": "duplicate"})
                continue
            proxy = Proxy(**item)
            self.db.add(proxy)
            existing_keys.add(key)
            imported.append(item)

        await self.db.commit()
        return len(imported), skipped

    async def check_proxy(self, proxy_id: int) -> Dict[str, Any]:
        proxy = await self.get_proxy(proxy_id)
        if not proxy:
            return {"success": False, "error": "Proxy not found"}

        proxy.status = "checking"
        await self.db.commit()

        start = time.time()
        response_time = 0
        status_code = None
        error_msg = ""
        success = False

        try:
            auth = ""
            if proxy.username:
                auth = f"{proxy.username}"
                if proxy.password:
                    auth += f":{proxy.password}"
                auth += "@"
            proxy_url = f"{proxy.protocol}://{auth}{proxy.ip}:{proxy.port}"

            transport = None
            proxy_arg = None
            if proxy.protocol.startswith("socks") and AsyncProxyTransport:
                transport = AsyncProxyTransport.from_url(proxy_url)
            else:
                proxy_arg = proxy_url

            client_kwargs = dict(
                timeout=settings.proxy_check_timeout,
                follow_redirects=True,
            )
            if transport:
                client_kwargs["transport"] = transport
            if proxy_arg:
                client_kwargs["proxy"] = proxy_arg

            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.get(settings.proxy_check_url)
                status_code = resp.status_code
                success = 200 <= resp.status_code < 400
                response_time = int((time.time() - start) * 1000)

                if not success:
                    error_msg = f"HTTP {resp.status_code}"
        except Exception as e:
            error_msg = str(e)
            success = False

        proxy.status = "active" if success else "failed"
        proxy.last_check_at = datetime.utcnow()
        if success:
            if proxy.response_time and response_time:
                proxy.response_time = int((proxy.response_time + response_time) / 2)
            else:
                proxy.response_time = response_time or proxy.response_time
            proxy.success_count = (proxy.success_count or 0) + 1
        else:
            proxy.fail_count = (proxy.fail_count or 0) + 1

        log_entry = ProxyCheckLog(
            proxy_id=proxy.id,
            success=success,
            response_time=response_time,
            status_code=status_code,
            error_message=error_msg,
            checked_at=datetime.utcnow(),
        )
        self.db.add(log_entry)
        await self.db.commit()
        await self.db.refresh(proxy)

        return {
            "proxy_id": proxy.id,
            "success": success,
            "response_time": response_time,
            "status_code": status_code,
            "error_message": error_msg,
            "status": proxy.status,
        }

    async def check_all_proxies(
        self,
        ids: Optional[List[int]] = None,
        status: Optional[str] = None,
        protocol: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        base_conditions = []
        tag_condition = None
        if ids:
            base_conditions.append(Proxy.id.in_(ids))
        if status:
            base_conditions.append(Proxy.status == status)
        if protocol:
            base_conditions.append(Proxy.protocol == protocol)
        if tags:
            tag_conditions = []
            for _tag in tags:
                json_each = func.json_each(Proxy.tags).table_valued(
                    column("value", String)
                )
                tag_conditions.append(
                    exists(
                        select(1)
                        .select_from(json_each)
                        .where(column("value") == _tag)
                        .correlate(Proxy)
                    )
                )
            tag_condition = or_(*tag_conditions)

        base_query = select(Proxy)
        if base_conditions:
            base_query = base_query.where(*base_conditions)

        full_query = base_query
        if tag_condition is not None:
            full_query = full_query.where(tag_condition)

        try:
            result = await self.db.execute(full_query)
            proxies = list(result.scalars().all())
        except Exception as _e:
            logger.warning(
                "check_all_proxies 使用 sql json_each 标签过滤执行失败，降级为不过滤：%s", _e
            )
            result = await self.db.execute(base_query)
            proxies = list(result.scalars().all())

        total = len(proxies)
        success_count = 0
        failed_count = 0
        results = []

        for proxy in proxies:
            r = await self.check_proxy(proxy.id)
            results.append(r)
            if r["success"]:
                success_count += 1
            else:
                failed_count += 1

        return {
            "total": total,
            "success": success_count,
            "failed": failed_count,
            "results": results,
        }

    async def get_check_logs(
        self, proxy_id: int, skip: int = 0, limit: int = 50
    ) -> Tuple[List[ProxyCheckLog], int]:
        count_query = select(func.count()).where(ProxyCheckLog.proxy_id == proxy_id)
        result = await self.db.execute(count_query)
        total = result.scalar() or 0

        query = (
            select(ProxyCheckLog)
            .where(ProxyCheckLog.proxy_id == proxy_id)
            .order_by(ProxyCheckLog.id.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        logs = result.scalars().all()
        return list(logs), total

    async def get_stats(self) -> ProxyStats:
        from ..schemas import ProxyStats as ProxyStatsSchema

        total_query = select(
            func.count().label("total"),
            func.sum(case((Proxy.status == "active", 1), else_=0)).label("active"),
            func.sum(case((Proxy.status == "inactive", 1), else_=0)).label("inactive"),
            func.sum(case((Proxy.status == "checking", 1), else_=0)).label("checking"),
            func.sum(case((Proxy.status == "failed", 1), else_=0)).label("failed"),
            func.avg(
                case(
                    (
                        (Proxy.success_count + Proxy.fail_count) > 0,
                        Proxy.success_count * 100.0 / (Proxy.success_count + Proxy.fail_count),
                    ),
                    else_=None,
                )
            ).label("avg_success_rate"),
            func.avg(
                case(
                    (Proxy.response_time > 0, Proxy.response_time),
                    else_=None,
                )
            ).label("avg_response_time"),
        )

        result = await self.db.execute(total_query)
        row = result.fetchone() or (0, 0, 0, 0, 0, None, None)

        total, active, inactive, checking, failed, avg_sr, avg_rt = row
        stats = ProxyStatsSchema(
            total=total or 0,
            active=active or 0,
            inactive=inactive or 0,
            checking=checking or 0,
            failed=failed or 0,
            avg_success_rate=round(float(avg_sr or 0), 2),
            avg_response_time=round(float(avg_rt or 0), 2),
        )

        proto_query = select(
            Proxy.protocol,
            func.count().label("cnt"),
        ).group_by(Proxy.protocol)

        result = await self.db.execute(proto_query)
        for proto, cnt in result.fetchall():
            stats.by_protocol[proto or "http"] = int(cnt or 0)

        return stats

    async def get_settings(self) -> ProxySettings:
        setting_keys = [
            "proxy_check_enabled",
            "proxy_check_interval",
            "proxy_check_url",
            "proxy_check_timeout",
            "default_proxy_rotation_strategy",
            "default_rate_limit_per_minute",
            "default_delay_min",
            "default_delay_max",
        ]

        query = select(SystemSetting).where(SystemSetting.key.in_(setting_keys))
        result = await self.db.execute(query)
        db_settings = {row.key: row.value for row in result.scalars().all()}

        defaults = {
            "proxy_check_enabled": settings.proxy_check_enabled,
            "proxy_check_interval": settings.proxy_check_interval,
            "proxy_check_url": settings.proxy_check_url,
            "proxy_check_timeout": settings.proxy_check_timeout,
            "default_proxy_rotation_strategy": settings.default_proxy_rotation_strategy,
            "default_rate_limit_per_minute": settings.default_rate_limit_per_minute,
            "default_delay_min": settings.default_delay_min,
            "default_delay_max": settings.default_delay_max,
        }

        data = {}
        for k in setting_keys:
            data[k] = db_settings.get(k, defaults[k])

        return ProxySettings(**data)

    async def save_settings(self, settings_data: ProxySettings) -> ProxySettings:
        data = settings_data.model_dump()
        for key, value in data.items():
            result = await self.db.execute(
                select(SystemSetting).where(SystemSetting.key == key)
            )
            setting = result.scalar_one_or_none()
            if setting:
                setting.value = value
            else:
                setting = SystemSetting(key=key, value=value)
                self.db.add(setting)
        await self.db.commit()
        return await self.get_settings()

    async def report_proxy_result(
        self, proxy_id: int, success: bool, response_time: int = 0
    ) -> None:
        proxy = await self.get_proxy(proxy_id)
        if not proxy:
            return

        if success:
            proxy.success_count = (proxy.success_count or 0) + 1
            if response_time:
                if proxy.response_time:
                    proxy.response_time = int((proxy.response_time + response_time) / 2)
                else:
                    proxy.response_time = response_time
        else:
            proxy.fail_count = (proxy.fail_count or 0) + 1

        proxy.last_used_at = datetime.utcnow()

        total = (proxy.success_count or 0) + (proxy.fail_count or 0)
        if total >= 5 and proxy.status == "active":
            fail_rate = (proxy.fail_count or 0) / total
            if fail_rate > 0.6:
                proxy.status = "failed"

        await self.db.commit()

    async def fetch_available_proxies(
        self, tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        base_conditions = [Proxy.status == "active"]
        tag_condition = None
        if tags:
            tag_conditions = []
            for _tag in tags:
                json_each = func.json_each(Proxy.tags).table_valued(
                    column("value", String)
                )
                tag_conditions.append(
                    exists(
                        select(1)
                        .select_from(json_each)
                        .where(column("value") == _tag)
                        .correlate(Proxy)
                    )
                )
            tag_condition = or_(*tag_conditions)

        base_query = select(Proxy).where(*base_conditions)

        full_query = base_query
        if tag_condition is not None:
            full_query = full_query.where(tag_condition)

        try:
            result = await self.db.execute(full_query)
            proxies = list(result.scalars().all())
        except Exception as _e:
            logger.warning(
                "fetch_available_proxies 使用 sql json_each 标签过滤执行失败，降级为不过滤：%s", _e
            )
            result = await self.db.execute(base_query)
            proxies = list(result.scalars().all())

        return [self._build_proxy_dict(p) for p in proxies]
