import asyncio
import json
import sys
import traceback
import uuid
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import bdb
from linecache import getline

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import settings
from ..models import DebugSession as DebugSessionModel
from ..schemas import ScrapeRules, DebugSessionState


class DebugCommand:
    STEP = "step"
    CONTINUE = "continue"
    STOP = "stop"
    NEXT = "next"
    RETURN = "return"


class SpiderDebugger(bdb.Bdb):
    def __init__(self, session_id: str, preamble_line_count: int = 0):
        bdb.Bdb.__init__(self)
        self.session_id = session_id
        self.preamble_line_count = preamble_line_count
        self.breakpoints_list: List[int] = []
        self.current_line = 0
        self.user_current_line = 0
        self.output: List[str] = []
        self.variables: Dict[str, Any] = {}
        self._wait_event = threading.Event()
        self.finished = False
        self.error: Optional[str] = None
        self.user_code_globals: Dict[str, Any] = {}
        self.user_code_locals: Dict[str, Any] = {}
        self.command = None
        self._current_frame = None
        self._filename = "<string>"
        self._lock = threading.Lock()

    def set_breakpoints(self, breakpoints: List[int]):
        self.clear_all_breaks()
        self.breakpoints_list = list(breakpoints)
        for line in breakpoints:
            real_line = line + self.preamble_line_count
            try:
                self.set_break(self._filename, real_line)
            except Exception:
                pass

    def user_call(self, frame, argument_list):
        filename = frame.f_code.co_filename
        if filename == self._filename:
            self._capture_state(frame)

    def user_line(self, frame):
        filename = frame.f_code.co_filename
        if filename != self._filename:
            return

        self.current_line = frame.f_lineno
        self.user_current_line = self.current_line - self.preamble_line_count
        self._capture_state(frame)
        self._current_frame = frame

        if self.user_current_line < 1:
            return

        self._wait_event.clear()
        self._wait_event.wait()

        if self.command == DebugCommand.STOP:
            self.finished = True
            raise bdb.BdbQuit

    def user_return(self, frame, return_value):
        pass

    def user_exception(self, frame, exc_info):
        exc_type, exc_value, exc_traceback = exc_info
        self.error = f"{exc_type.__name__}: {exc_value}"
        self.output.append(f"ERROR: {self.error}")
        self.output.append(traceback.format_exc())

    def _capture_state(self, frame):
        with self._lock:
            self.user_code_locals = frame.f_locals.copy()
            self.user_code_globals = frame.f_globals.copy()

            public_vars = {}
            for key, value in self.user_code_locals.items():
                if not key.startswith("_") and key not in ("save_item", "log", "fetch_page", "auto_crawl", "rules"):
                    try:
                        repr_val = repr(value)
                        if len(repr_val) > 1000:
                            repr_val = repr_val[:1000] + "..."
                        public_vars[key] = repr_val
                    except Exception:
                        public_vars[key] = "<unserializable>"

            self.variables = public_vars

    def resume(self, command: str):
        self.command = command
        if command == DebugCommand.STEP:
            self.set_step()
        elif command == DebugCommand.NEXT:
            if self._current_frame:
                self.set_next(self._current_frame)
            else:
                self.set_step()
        elif command == DebugCommand.CONTINUE:
            self.set_continue()
        elif command == DebugCommand.STOP:
            self.finished = True
            self.set_continue()
        self._wait_event.set()

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "current_line": self.user_current_line,
                "breakpoints": list(self.breakpoints_list),
                "variables": dict(self.variables),
                "output": list(self.output),
                "error": self.error,
                "finished": self.finished,
            }

    def trace_dispatch(self, frame, event, arg):
        if self.finished:
            return None
        return bdb.Bdb.trace_dispatch(self, frame, event, arg)


class DebugService:
    _active_sessions: Dict[str, SpiderDebugger] = {}
    _threads: Dict[str, threading.Thread] = {}

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(
        self,
        code: str,
        scrape_rules: Optional[ScrapeRules] = None,
        script_id: Optional[int] = None,
    ) -> DebugSessionModel:
        session_id = uuid.uuid4().hex
        rules = scrape_rules or ScrapeRules()

        debug_session = DebugSessionModel(
            session_id=session_id,
            script_id=script_id,
            code=code,
            scrape_rules=rules.model_dump(),
            status="idle",
            current_line=0,
            breakpoints=[],
            variables={},
            output=[],
        )
        self.db.add(debug_session)
        await self.db.commit()
        await self.db.refresh(debug_session)

        return debug_session

    async def get_session(self, session_id: str) -> Optional[DebugSessionModel]:
        result = await self.db.execute(
            select(DebugSessionModel).where(
                DebugSessionModel.session_id == session_id
            )
        )
        return result.scalar_one_or_none()

    def _build_preamble(self, rules: ScrapeRules) -> str:
        rules_json = json.dumps(rules.model_dump())

        preamble = f'''import json
import sys
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    pass

rules_data = json.loads({rules_json!r})

class _ScrapeRules:
    def __init__(self, data):
        self.start_urls = data.get("start_urls", [])
        self.allowed_domains = data.get("allowed_domains", [])
        self.follow_links = data.get("follow_links", False)
        self.max_pages = data.get("max_pages", 100)
        self.delay = data.get("delay", 0.5)
        self.user_agent = data.get("user_agent", "Mozilla/5.0")
        self.custom_headers = data.get("custom_headers", {{}})
        self.extract_patterns = data.get("extract_patterns", {{}})

rules = _ScrapeRules(rules_data)
results = []
logs = []
_visited_urls = set()
_pages_scraped = 0

def save_item(data, url=""):
    results.append({{"url": url, "data": data}})
    logs.append(f"[SAVE] Saved item from {{url}}")

def log(message):
    from datetime import datetime
    timestamp = datetime.utcnow().isoformat()
    log_msg = f"[{{timestamp}}] {{message}}"
    logs.append(log_msg)
    print(log_msg)

def _get_headers():
    headers = {{"User-Agent": rules.user_agent}}
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
    data = {{}}
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
            data[key] = f"ERROR: {{str(e)}}"
    return data

def fetch_page(url):
    global _pages_scraped
    if _pages_scraped >= rules.max_pages:
        return None

    if url in _visited_urls:
        return None

    if not _is_allowed_url(url):
        log(f"域名不在允许范围内，跳过: {{url}}")
        return None

    _visited_urls.add(url)
    _pages_scraped += 1

    log(f"请求页面 [{{_pages_scraped}}/{{rules.max_pages}}]: {{url}}")
    try:
        resp = requests.get(url, headers=_get_headers(), timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        return soup
    except Exception as e:
        log(f"请求失败 {{url}}: {{str(e)}}")
        return None

def auto_crawl():
    global _pages_scraped
    log(f"开始自动爬取，起始 URL 数量: {{len(rules.start_urls)}}")
    log(f"配置: follow_links={{rules.follow_links}}, max_pages={{rules.max_pages}}")
    if rules.follow_links and rules.allowed_domains:
        log(f"允许的域名: {{', '.join(rules.allowed_domains)}}")
    if rules.extract_patterns:
        log(f"提取规则: {{list(rules.extract_patterns.keys())}}")

    url_queue = deque()

    for url in rules.start_urls:
        if url not in _visited_urls and _is_allowed_url(url):
            url_queue.append(url)

    first_request = True
    import time
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
            log(f"  提取到 {{len(extracted)}} 个字段")

        if rules.follow_links and _pages_scraped < rules.max_pages:
            links = _extract_links(soup, current_url)
            log(f"  发现 {{len(links)}} 个链接")
            added = 0
            for link in links:
                if link not in _visited_urls and _is_allowed_url(link):
                    url_queue.append(link)
                    added += 1
            if added > 0:
                log(f"  队列中新增 {{added}} 个待抓取链接")

    log(f"爬取完成，共抓取 {{_pages_scraped}} 个页面，提取 {{len(results)}} 条结果")
'''
        return preamble

    def _count_preamble_lines(self, preamble: str) -> int:
        lines = preamble.split("\n")
        return len(lines)

    async def start_debugging(self, session_id: str) -> DebugSessionState:
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        rules = ScrapeRules(**session.scrape_rules) if session.scrape_rules else ScrapeRules()

        preamble = self._build_preamble(rules)
        preamble_line_count = self._count_preamble_lines(preamble)

        debugger = SpiderDebugger(session_id, preamble_line_count=preamble_line_count)
        self._active_sessions[session_id] = debugger

        session.status = "running"
        await self.db.commit()

        full_code = preamble + "\n" + session.code
        debugger.set_step()

        thread = threading.Thread(
            target=self._run_debugger_sync,
            args=(session_id, full_code, debugger),
            daemon=True,
        )
        self._threads[session_id] = thread
        thread.start()

        await asyncio.sleep(0.3)
        return await self.get_state(session_id)

    def _run_debugger_sync(self, session_id: str, full_code: str, debugger: SpiderDebugger):
        import io
        import contextlib

        output_capture = io.StringIO()

        try:
            with contextlib.redirect_stdout(output_capture):
                try:
                    code_obj = compile(full_code, "<string>", "exec")
                    globals_dict = {"__name__": "__main__"}
                    debugger.run(code_obj, globals_dict)
                except bdb.BdbQuit:
                    debugger.output.append("Debug session stopped by user")
                except Exception as e:
                    debugger.error = f"{type(e).__name__}: {e}"
                    debugger.output.append(f"ERROR: {debugger.error}")
                    debugger.output.append(traceback.format_exc())

            captured_output = output_capture.getvalue()
            if captured_output:
                for line in captured_output.strip().split("\n"):
                    if line and line not in debugger.output:
                        debugger.output.append(line)

            debugger.finished = True

        except Exception as e:
            debugger.error = f"Debug error: {type(e).__name__}: {e}"
            debugger.output.append(debugger.error)
            debugger.output.append(traceback.format_exc())
            debugger.finished = True

    async def execute_command(
        self, session_id: str, command: str, breakpoints: List[int] = None
    ) -> DebugSessionState:
        debugger = self._active_sessions.get(session_id)
        if not debugger:
            session = await self.get_session(session_id)
            if session and session.status in ["idle", "finished", "error", "stopped"]:
                return await self.get_state(session_id)
            raise ValueError(f"No active debug session for {session_id}")

        if breakpoints is not None:
            debugger.set_breakpoints(breakpoints)

        debugger.resume(command)

        await asyncio.sleep(0.2)

        return await self.get_state(session_id)

    async def get_state(self, session_id: str) -> DebugSessionState:
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        debugger = self._active_sessions.get(session_id)
        if debugger:
            snapshot = debugger.get_snapshot()
            session.current_line = snapshot["current_line"]
            session.breakpoints = snapshot["breakpoints"]
            session.variables = snapshot["variables"]
            session.output = snapshot["output"][-200:] if len(snapshot["output"]) > 200 else snapshot["output"]
            if snapshot["finished"]:
                session.status = "finished" if not snapshot["error"] else "error"
            await self.db.commit()

        return DebugSessionState(
            session_id=session_id,
            status=session.status,
            current_line=session.current_line,
            breakpoints=session.breakpoints,
            variables=session.variables,
            output=session.output,
            error=debugger.error if debugger else None,
        )

    async def stop_session(self, session_id: str):
        debugger = self._active_sessions.get(session_id)
        if debugger:
            debugger.resume(DebugCommand.STOP)

        session = await self.get_session(session_id)
        if session:
            session.status = "stopped"
            await self.db.commit()

        if session_id in self._threads:
            self._threads[session_id].join(timeout=2)
            del self._threads[session_id]

        if session_id in self._active_sessions:
            del self._active_sessions[session_id]
