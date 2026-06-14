import asyncio
import json
import subprocess
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from ..config import settings
from ..models import SpiderJob, SpiderResult, SpiderTask, SpiderScript, CleaningPipeline
from ..schemas import ScrapeRules
from .cleaning_engine import CleaningEngine
from .proxy_pool import ProxyPoolService


class SpiderContext:
    def __init__(self, rules: ScrapeRules):
        self.rules = rules
        self.results: List[Dict[str, Any]] = []
        self.logs: List[str] = []

    def save_item(self, data: Dict[str, Any], url: str = "") -> None:
        self.results.append({"url": url, "data": data})

    def log(self, message: str) -> None:
        timestamp = datetime.utcnow().isoformat()
        self.logs.append(f"[{timestamp}] {message}")


class SpiderExecutor:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def execute_task(self, task_id: int) -> Dict[str, Any]:
        result = await self.db.execute(select(SpiderTask).where(SpiderTask.id == task_id))
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        result = await self.db.execute(select(SpiderScript).where(SpiderScript.id == task.script_id))
        script = result.scalar_one_or_none()

        if not script:
            raise ValueError(f"Script {task.script_id} not found")

        rules = ScrapeRules(**task.scrape_rules) if task.scrape_rules else ScrapeRules()
        max_retries = task.max_retries or 0
        execution_id = uuid.uuid4().hex

        proxy_config = {
            "enabled": bool(getattr(task, "proxy_enabled", False)),
            "tags": getattr(task, "proxy_tags", []) or [],
            "strategy": getattr(task, "proxy_rotation_strategy", settings.default_proxy_rotation_strategy),
            "retry_on_fail": getattr(task, "retry_on_proxy_fail", 3),
        }

        rate_config = {
            "enabled": bool(getattr(task, "rate_limit_enabled", True)),
            "per_minute": getattr(task, "rate_limit_per_minute", settings.default_rate_limit_per_minute),
            "delay_min": getattr(task, "delay_min", settings.default_delay_min),
            "delay_max": getattr(task, "delay_max", settings.default_delay_max),
        }

        available_proxies: List[Dict[str, Any]] = []
        if proxy_config["enabled"]:
            proxy_service = ProxyPoolService(self.db)
            available_proxies = await proxy_service.fetch_available_proxies(tags=proxy_config["tags"])

        last_result = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                await asyncio.sleep(1)
            last_result = await self._execute(
                script.code, rules, task.id, task.timeout, attempt, execution_id,
                proxy_config=proxy_config, rate_config=rate_config,
                available_proxies=available_proxies,
            )
            if last_result.get("status") == "completed":
                break

        return last_result

    async def execute_script(
        self,
        script_id: int,
        scrape_rules: Optional[ScrapeRules] = None
    ) -> Dict[str, Any]:
        result = await self.db.execute(select(SpiderScript).where(SpiderScript.id == script_id))
        script = result.scalar_one_or_none()

        if not script:
            raise ValueError(f"Script {script_id} not found")

        rules = scrape_rules or ScrapeRules()
        execution_id = uuid.uuid4().hex

        proxy_config = {
            "enabled": False,
            "tags": [],
            "strategy": settings.default_proxy_rotation_strategy,
            "retry_on_fail": 3,
        }
        rate_config = {
            "enabled": True,
            "per_minute": settings.default_rate_limit_per_minute,
            "delay_min": settings.default_delay_min,
            "delay_max": settings.default_delay_max,
        }

        return await self._execute(
            script.code, rules, None, 60, 0, execution_id,
            proxy_config=proxy_config, rate_config=rate_config, available_proxies=[],
        )

    async def execute_code(
        self,
        code: str,
        scrape_rules: Optional[ScrapeRules] = None
    ) -> Dict[str, Any]:
        rules = scrape_rules or ScrapeRules()
        execution_id = uuid.uuid4().hex

        proxy_config = {
            "enabled": False,
            "tags": [],
            "strategy": settings.default_proxy_rotation_strategy,
            "retry_on_fail": 3,
        }
        rate_config = {
            "enabled": True,
            "per_minute": settings.default_rate_limit_per_minute,
            "delay_min": settings.default_delay_min,
            "delay_max": settings.default_delay_max,
        }

        return await self._execute(
            code, rules, None, 60, 0, execution_id,
            proxy_config=proxy_config, rate_config=rate_config, available_proxies=[],
        )

    async def _execute(
        self,
        code: str,
        rules: ScrapeRules,
        task_id: Optional[int],
        timeout: int,
        retry_count: int = 0,
        execution_id: Optional[str] = None,
        proxy_config: Optional[Dict[str, Any]] = None,
        rate_config: Optional[Dict[str, Any]] = None,
        available_proxies: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        if execution_id is None:
            execution_id = uuid.uuid4().hex
        if proxy_config is None:
            proxy_config = {"enabled": False, "tags": [], "strategy": "random", "retry_on_fail": 3}
        if rate_config is None:
            rate_config = {"enabled": True, "per_minute": 60, "delay_min": 0.5, "delay_max": 2.0}
        if available_proxies is None:
            available_proxies = []

        job = SpiderJob(
            task_id=task_id or 0,
            execution_id=execution_id,
            retry_count=retry_count,
            status="running",
            started_at=datetime.utcnow()
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        script_path = settings.scripts_dir / f"job_{job.id}_{uuid.uuid4().hex}.py"

        try:
            full_code = self._wrap_code(
                code, rules, retry_count,
                proxy_config=proxy_config, rate_config=rate_config,
                available_proxies=available_proxies,
            )
            script_path.write_text(full_code)

            output_path = settings.results_dir / f"job_{job.id}_output.json"

            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(script_path), str(output_path),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise TimeoutError(f"Execution timed out after {timeout} seconds")

            if proc.returncode != 0:
                error_msg = stderr.decode()
                raise RuntimeError(f"Script failed: {error_msg}")

            if output_path.exists():
                with open(output_path, "r", encoding="utf-8") as f:
                    execution_result = json.load(f)
            else:
                execution_result = {"results": [], "logs": [], "error": "No output generated"}

            if execution_result.get("error"):
                error_msg = execution_result["error"]
                log_text = "\n".join(execution_result.get("logs", []))
                raise RuntimeError(f"Script error: {error_msg}\n{log_text}")

            items_scraped = len(execution_result.get("results", []))

            cleaned_results = execution_result.get("results", [])
            if task_id and task_id > 0:
                cleaning_rules = await self._get_cleaning_rules(task_id)
                if cleaning_rules:
                    engine = CleaningEngine(cleaning_rules)
                    raw_items = [item.get("data", {}) for item in cleaned_results]
                    cleaned_items = engine.clean_items(raw_items)
                    for i, item in enumerate(cleaned_results):
                        item["data"] = cleaned_items[i]

            for item in cleaned_results:
                result_record = SpiderResult(
                    job_id=job.id,
                    url=item.get("url", ""),
                    data=item.get("data", {})
                )
                self.db.add(result_record)

            job.status = "completed"
            job.finished_at = datetime.utcnow()
            job.duration = int((job.finished_at - job.started_at).total_seconds())
            job.items_scraped = items_scraped
            job.error_message = ""

            await self.db.commit()

            return {
                "job_id": job.id,
                "execution_id": execution_id,
                "status": "completed",
                "items_scraped": items_scraped,
                "duration": job.duration,
                "results": execution_result.get("results", []),
                "logs": execution_result.get("logs", []),
                "retry_count": retry_count
            }

        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.duration = int((job.finished_at - job.started_at).total_seconds())
            job.error_message = error_msg
            await self.db.commit()

            return {
                "job_id": job.id,
                "execution_id": execution_id,
                "status": "failed",
                "items_scraped": 0,
                "duration": job.duration,
                "results": [],
                "logs": [],
                "error": error_msg,
                "retry_count": retry_count
            }

        finally:
            if script_path.exists():
                script_path.unlink()
            output_path = settings.results_dir / f"job_{job.id}_output.json"
            if output_path.exists():
                output_path.unlink()

    def _wrap_code(
        self,
        user_code: str,
        rules: ScrapeRules,
        retry_count: int = 0,
        proxy_config: Optional[Dict[str, Any]] = None,
        rate_config: Optional[Dict[str, Any]] = None,
        available_proxies: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        rules_json = json.dumps(rules.model_dump())
        proxy_json = json.dumps(proxy_config or {"enabled": False})
        rate_json = json.dumps(rate_config or {"enabled": True})
        proxies_json = json.dumps(available_proxies or [])
        indented_user_code = "\n".join("    " + line for line in user_code.split("\n"))

        wrapper = '''
import sys
import json
import traceback
import time
import random
import threading
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    pass

output_path = Path(sys.argv[1])

rules_data = json.loads(%r)
_proxy_config = json.loads(%r)
_rate_config = json.loads(%r)
_available_proxies = json.loads(%r)

class _ScrapeRules:
    def __init__(self, data):
        self.start_urls = data.get("start_urls", [])
        self.allowed_domains = data.get("allowed_domains", [])
        self.follow_links = data.get("follow_links", False)
        self.max_pages = data.get("max_pages", 100)
        self.delay = data.get("delay", 0.5)
        self.user_agent = data.get("user_agent", "Mozilla/5.0")
        self.custom_headers = data.get("custom_headers", {})
        self.extract_patterns = data.get("extract_patterns", {})

rules = _ScrapeRules(rules_data)
results = []
logs = []
_visited_urls = set()
_pages_scraped = 0

# ========== 频率限制器（令牌桶） ==========
class _RateLimiter:
    def __init__(self, per_minute: int, enabled: bool = True):
        self.enabled = enabled and per_minute > 0
        if self.enabled:
            self._rate = per_minute / 60.0
            self._tokens = float(min(per_minute, 10))
            self._last_refill = time.time()
            self._lock = threading.Lock()

    def _refill(self):
        now = time.time()
        elapsed = now - self._last_refill
        self._tokens = min(self._tokens + elapsed * self._rate, self._rate * 60)
        self._last_refill = now

    def acquire(self, timeout: float = 30.0) -> bool:
        if not self.enabled:
            return True
        start = time.time()
        while time.time() - start < timeout:
            with self._lock:
                self._refill()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return True
            time.sleep(0.05)
        return False

_rate_limiter = _RateLimiter(
    per_minute=_rate_config.get("per_minute", 60),
    enabled=_rate_config.get("enabled", True),
)

def wait_for_rate_limit():
    if not _rate_limiter.acquire():
        log("警告：频率限制等待超时，继续请求")

# ========== 代理池管理 ==========
class _ProxySelector:
    def __init__(self, proxies: list, strategy: str = "random", enabled: bool = True):
        self.enabled = enabled and bool(proxies)
        self._proxies = list(proxies) if proxies else []
        self._strategy = strategy
        self._rr_index = 0
        self._lock = threading.Lock()
        self._current = None
        self._used_count = {}

    def has_available(self) -> bool:
        return len(self._proxies) > 0

    def available_count(self) -> int:
        return len(self._proxies)

    def _weighted_by_rt(self):
        weights = []
        for p in self._proxies:
            rt = max(p.get("response_time", 100) or 1, 1)
            w = 1000.0 / rt
            weights.append(max(w, 0.1))
        return weights

    def get_next(self, exclude_id: int = None):
        if not self.enabled:
            return None
        candidates = self._proxies
        if exclude_id is not None and len(self._proxies) > 1:
            candidates = [p for p in self._proxies if p.get("id") != exclude_id]
            if not candidates:
                candidates = self._proxies
        if not candidates:
            return None

        with self._lock:
            if self._strategy == "round_robin":
                p = candidates[self._rr_index % len(candidates)]
                self._rr_index += 1
            elif self._strategy == "by_response_time":
                try:
                    weights = []
                    for p in candidates:
                        rt = max(p.get("response_time", 100) or 1, 1)
                        w = 1000.0 / rt
                        weights.append(max(w, 0.1))
                    p = random.choices(candidates, weights=weights, k=1)[0]
                except Exception:
                    p = random.choice(candidates)
            else:
                p = random.choice(candidates)

            pid = p.get("id")
            self._used_count[pid] = self._used_count.get(pid, 0) + 1
            self._current = p
            return p

    def get_current(self):
        return self._current

    def mark_failed(self, proxy_id: int):
        if len(self._proxies) <= 1:
            return
        self._proxies = [p for p in self._proxies if p.get("id") != proxy_id]

_proxy_selector = _ProxySelector(
    proxies=_available_proxies,
    strategy=_proxy_config.get("strategy", "random"),
    enabled=_proxy_config.get("enabled", False),
)
_proxy_retry_max = _proxy_config.get("retry_on_fail", 3)

def get_current_proxy():
    p = _proxy_selector.get_current()
    if p:
        return {
            "id": p.get("id"),
            "ip": p.get("ip"),
            "port": p.get("port"),
            "protocol": p.get("protocol"),
            "proxy_url": p.get("proxy_url"),
        }
    return None

def has_available_proxies():
    return _proxy_selector.has_available()

def rotate_proxy(reason: str = ""):
    current = _proxy_selector.get_current()
    exclude_id = current.get("id") if current else None
    if reason:
        log(f"切换代理，原因: {reason}")
    new_p = _proxy_selector.get_next(exclude_id=exclude_id)
    if new_p:
        log(f"使用代理: {new_p.get('protocol')}://{new_p.get('ip')}:{new_p.get('port')}")
        return {
            "id": new_p.get("id"),
            "ip": new_p.get("ip"),
            "port": new_p.get("port"),
            "protocol": new_p.get("protocol"),
        }
    else:
        log("警告：无可用代理，使用直连")
        return None

def report_proxy(success: bool, response_time: int = 0):
    pass

# ========== 随机延迟 ==========
def _random_delay():
    dmin = _rate_config.get("delay_min", 0.5) or 0
    dmax = _rate_config.get("delay_max", 2.0) or 0
    base_delay = rules.delay or 0
    delay = max(base_delay, random.uniform(dmin, dmax) if dmax >= dmin else dmin)
    if delay > 0:
        time.sleep(delay)

# ========== requests monkeypatch ==========
_original_request = None
try:
    _original_request = requests.Session.request
except Exception:
    pass

def _patched_request(self, method, url, **kwargs):
    if _proxy_selector.enabled and "proxies" not in kwargs:
        proxy = _proxy_selector.get_next()
        if proxy:
            kwargs["proxies"] = proxy.get("proxies")
    return _original_request(self, method, url, **kwargs)

if _original_request is not None:
    try:
        requests.Session.request = _patched_request
    except Exception:
        pass

# ========== 通用辅助函数 ==========
def save_item(data, url=""):
    results.append({"url": url, "data": data})

def log(message):
    from datetime import datetime
    timestamp = datetime.utcnow().isoformat()
    logs.append(f"[{timestamp}] {message}")

def _get_headers():
    headers = {"User-Agent": rules.user_agent}
    if rules.custom_headers:
        headers.update(rules.custom_headers)
    return headers

def _is_allowed_url(url):
    if not rules.allowed_domains:
        return True
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        for allowed in rules.allowed_domains:
            if domain == allowed or domain.endswith("." + allowed):
                return True
        return False
    except Exception:
        return False

def _extract_links(soup, base_url):
    links = []
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        try:
            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)
            if parsed.scheme in ("http", "https"):
                clean_url = parsed.scheme + "://" + parsed.netloc + parsed.path
                if parsed.query:
                    clean_url += "?" + parsed.query
                links.append(clean_url)
        except Exception:
            continue
    return links

def _extract_data(soup, url=""):
    data = {}
    if not rules.extract_patterns:
        return data
    for key, selector in rules.extract_patterns.items():
        try:
            elements = soup.select(selector)
            if len(elements) == 1:
                data[key] = elements[0].get_text(strip=True)
            elif len(elements) > 1:
                data[key] = [el.get_text(strip=True) for el in elements]
            else:
                data[key] = None
        except Exception as e:
            data[key] = f"ERROR: {str(e)}"
    return data

def fetch_page(url, force_proxy: bool = False):
    global _pages_scraped
    if _pages_scraped >= rules.max_pages:
        return None

    if url in _visited_urls:
        return None

    if not _is_allowed_url(url):
        log(f"域名不在允许范围内，跳过: {url}")
        return None

    _visited_urls.add(url)
    _pages_scraped += 1

    log(f"请求页面 [{_pages_scraped}/{rules.max_pages}]: {url}")

    _attempts = 0
    _max_attempts = max(1, _proxy_retry_max if _proxy_selector.enabled else 1)
    _last_error = ""

    while _attempts < _max_attempts:
        _attempts += 1

        wait_for_rate_limit()
        _random_delay()

        proxies = None
        proxy_id = None
        proxy_desc = "直连"

        if _proxy_selector.enabled:
            proxy = _proxy_selector.get_next()
            if proxy:
                proxies = proxy.get("proxies")
                proxy_id = proxy.get("id")
                proxy_desc = f"{proxy.get('protocol')}://{proxy.get('ip')}:{proxy.get('port')}"

        log(f"  [尝试 {_attempts}/{_max_attempts}] 通过 {proxy_desc} 请求")

        _start = time.time()
        try:
            resp = requests.get(
                url,
                headers=_get_headers(),
                proxies=proxies,
                timeout=30,
                allow_redirects=True,
            )
            _rt = int((time.time() - _start) * 1000)

            if 400 <= resp.status_code < 500 and resp.status_code in (403, 429):
                _last_error = f"HTTP {resp.status_code}"
                log(f"  收到 {resp.status_code}，尝试切换代理")
                if proxy_id is not None:
                    _proxy_selector.mark_failed(proxy_id)
                time.sleep(1)
                continue

            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            log(f"  请求成功 ({resp.status_code}, 耗时 {_rt}ms)")
            return soup

        except Exception as e:
            _rt = int((time.time() - _start) * 1000)
            _last_error = str(e)
            log(f"  请求失败: {_last_error}")
            if proxy_id is not None:
                _proxy_selector.mark_failed(proxy_id)
            if _attempts < _max_attempts:
                time.sleep(0.5)
            continue

    log(f"  最终失败 {url}: {_last_error}")
    return None

def auto_crawl():
    global _pages_scraped
    log(f"开始自动爬取，起始 URL 数量: {len(rules.start_urls)}")
    log(f"配置: follow_links={rules.follow_links}, max_pages={rules.max_pages}")
    if _proxy_selector.enabled:
        log(f"代理池: 已启用，可用代理数 {_proxy_selector.available_count()}，策略: {_proxy_config.get('strategy')}")
    if _rate_config.get("enabled"):
        log(f"频率限制: 每分钟 {_rate_config.get('per_minute')} 次，延迟 {_rate_config.get('delay_min')}s~{_rate_config.get('delay_max')}s")
    if rules.follow_links and rules.allowed_domains:
        log(f"允许的域名: {', '.join(rules.allowed_domains)}")
    if rules.extract_patterns:
        log(f"提取规则: {list(rules.extract_patterns.keys())}")

    url_queue = deque()

    for url in rules.start_urls:
        if url not in _visited_urls and _is_allowed_url(url):
            url_queue.append(url)

    first_request = True
    while url_queue and _pages_scraped < rules.max_pages:
        if not first_request and rules.delay > 0 and not _rate_config.get("enabled"):
            time.sleep(rules.delay)
        first_request = False

        current_url = url_queue.popleft()
        soup = fetch_page(current_url)
        if soup is None:
            continue

        extracted = _extract_data(soup, current_url)
        if extracted:
            save_item(extracted, current_url)
            log(f"  提取到 {len(extracted)} 个字段")

        if rules.follow_links and _pages_scraped < rules.max_pages:
            links = _extract_links(soup, current_url)
            log(f"  发现 {len(links)} 个链接")
            added = 0
            for link in links:
                if link not in _visited_urls and _is_allowed_url(link):
                    url_queue.append(link)
                    added += 1
            if added > 0:
                log(f"  队列中新增 {added} 个待抓取链接")

    log(f"爬取完成，共抓取 {_pages_scraped} 个页面，提取 {len(results)} 条结果")

try:
%s
except Exception as e:
    error_trace = traceback.format_exc()
    logs.append(f"ERROR: {str(e)}")
    logs.append(error_trace)
    output = {"results": results, "logs": logs, "error": str(e)}
else:
    output = {"results": results, "logs": logs, "error": None}

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
''' % (rules_json, proxy_json, rate_json, proxies_json, indented_user_code)
        return wrapper

    async def _get_cleaning_rules(self, task_id: int) -> Optional[List[Dict[str, Any]]]:
        result = await self.db.execute(
            select(SpiderTask)
            .where(SpiderTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task or not task.cleaning_pipeline_id:
            return None

        result = await self.db.execute(
            select(CleaningPipeline)
            .options(joinedload(CleaningPipeline.rules))
            .where(CleaningPipeline.id == task.cleaning_pipeline_id)
        )
        pipeline = result.scalars().unique().one_or_none()
        if not pipeline:
            return None

        rules = []
        for rule in pipeline.rules:
            rules.append({
                "rule_type": rule.rule_type,
                "field_name": rule.field_name,
                "params": rule.params,
                "order_index": rule.order_index,
            })
        return rules if rules else None

