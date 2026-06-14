import asyncio
import json
import subprocess
import sys
import traceback
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import settings
from ..models import SpiderJob, SpiderResult, SpiderTask, SpiderScript
from ..schemas import ScrapeRules


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

        last_result = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                await asyncio.sleep(1)
            last_result = await self._execute(
                script.code, rules, task.id, task.timeout, attempt, execution_id
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
        return await self._execute(script.code, rules, None, 60, 0, execution_id)

    async def execute_code(
        self,
        code: str,
        scrape_rules: Optional[ScrapeRules] = None
    ) -> Dict[str, Any]:
        rules = scrape_rules or ScrapeRules()
        execution_id = uuid.uuid4().hex
        return await self._execute(code, rules, None, 60, 0, execution_id)

    async def _execute(
        self,
        code: str,
        rules: ScrapeRules,
        task_id: Optional[int],
        timeout: int,
        retry_count: int = 0,
        execution_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if execution_id is None:
            execution_id = uuid.uuid4().hex

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
            full_code = self._wrap_code(code, rules, retry_count)
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

            for item in execution_result.get("results", []):
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

    def _wrap_code(self, user_code: str, rules: ScrapeRules, retry_count: int = 0) -> str:
        rules_json = json.dumps(rules.model_dump())
        indented_user_code = "\n".join("    " + line for line in user_code.split("\n"))

        wrapper = '''
import sys
import json
import traceback
import time
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

def fetch_page(url):
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
    try:
        resp = requests.get(url, headers=_get_headers(), timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        return soup
    except Exception as e:
        log(f"请求失败 {url}: {str(e)}")
        return None

def auto_crawl():
    global _pages_scraped
    log(f"开始自动爬取，起始 URL 数量: {len(rules.start_urls)}")
    log(f"配置: follow_links={rules.follow_links}, max_pages={rules.max_pages}")
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
        if not first_request and rules.delay > 0:
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
''' % (rules_json, indented_user_code)
        return wrapper
