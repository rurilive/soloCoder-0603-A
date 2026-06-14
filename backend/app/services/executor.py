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
        return await self._execute(script.code, rules, task.id, task.timeout)

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
        return await self._execute(script.code, rules, None, 60)

    async def execute_code(
        self,
        code: str,
        scrape_rules: Optional[ScrapeRules] = None
    ) -> Dict[str, Any]:
        rules = scrape_rules or ScrapeRules()
        return await self._execute(code, rules, None, 60)

    async def _execute(
        self,
        code: str,
        rules: ScrapeRules,
        task_id: Optional[int],
        timeout: int
    ) -> Dict[str, Any]:
        job = SpiderJob(
            task_id=task_id or 0,
            status="running",
            started_at=datetime.utcnow()
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        script_path = settings.scripts_dir / f"job_{job.id}_{uuid.uuid4().hex}.py"

        try:
            full_code = self._wrap_code(code, rules)
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
                "status": "completed",
                "items_scraped": items_scraped,
                "duration": job.duration,
                "results": execution_result.get("results", []),
                "logs": execution_result.get("logs", [])
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
                "status": "failed",
                "items_scraped": 0,
                "duration": job.duration,
                "results": [],
                "logs": [],
                "error": error_msg
            }

        finally:
            if script_path.exists():
                script_path.unlink()
            output_path = settings.results_dir / f"job_{job.id}_output.json"
            if output_path.exists():
                output_path.unlink()

    def _wrap_code(self, user_code: str, rules: ScrapeRules) -> str:
        rules_json = json.dumps(rules.model_dump())
        indented_user_code = "\n".join("    " + line for line in user_code.split("\n"))

        wrapper = '''
import sys
import json
import traceback
from pathlib import Path

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

def save_item(data, url=""):
    results.append({"url": url, "data": data})

def log(message):
    from datetime import datetime
    timestamp = datetime.utcnow().isoformat()
    logs.append(f"[{timestamp}] {message}")

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
