import re
import random
import time
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from urllib.parse import urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import joinedload

from ..config import settings
from ..models import Proxy, ProxyCheckLog


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
        query = select(Proxy)
        conditions = []

        if status:
            conditions.append(Proxy.status == status)
        if protocol:
            conditions.append(Proxy.protocol == protocol)
        if tag:
            conditions.append(Proxy.tags.op("json_contains")(f'["{tag}"]'))
        if keyword:
            like = f"%{keyword}%"
            conditions.append(or_(Proxy.ip.like(like), Proxy.remark.like(like)))

        if conditions:
            query = query.where(*conditions)

        count_query = select(func.count()).select_from(query.subquery())
        result = await self.db.execute(count_query)
        total = result.scalar() or 0

        query = query.order_by(Proxy.id.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
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
            if value is not None:
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
            proxies = {
                "http://": proxy_url,
                "https://": proxy_url,
            }

            async with httpx.AsyncClient(
                proxies=proxies,
                timeout=settings.proxy_check_timeout,
                follow_redirects=True,
            ) as client:
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
        query = select(Proxy)
        conditions = []
        if ids:
            conditions.append(Proxy.id.in_(ids))
        if status:
            conditions.append(Proxy.status == status)
        if protocol:
            conditions.append(Proxy.protocol == protocol)
        if tags:
            for t in tags:
                conditions.append(Proxy.tags.op("json_contains")(f'["{t}"]'))
        if conditions:
            query = query.where(*conditions)

        result = await self.db.execute(query)
        proxies = result.scalars().all()

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

        result = await self.db.execute(select(Proxy))
        proxies = result.scalars().all()

        stats = ProxyStatsSchema(total=len(proxies))
        success_rates = []
        response_times = []

        for p in proxies:
            if p.status == "active":
                stats.active += 1
            elif p.status == "inactive":
                stats.inactive += 1
            elif p.status == "checking":
                stats.checking += 1
            elif p.status == "failed":
                stats.failed += 1

            proto = p.protocol or "http"
            stats.by_protocol[proto] = stats.by_protocol.get(proto, 0) + 1

            total = (p.success_count or 0) + (p.fail_count or 0)
            if total > 0:
                success_rates.append((p.success_count or 0) / total)
            if p.response_time:
                response_times.append(p.response_time)

        if success_rates:
            stats.avg_success_rate = round(sum(success_rates) / len(success_rates) * 100, 2)
        if response_times:
            stats.avg_response_time = round(sum(response_times) / len(response_times), 2)

        return stats

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
        query = select(Proxy).where(Proxy.status == "active")
        if tags:
            for t in tags:
                query = query.where(Proxy.tags.op("json_contains")(f'["{t}"]'))

        result = await self.db.execute(query)
        proxies = result.scalars().all()
        return [self._build_proxy_dict(p) for p in proxies]
