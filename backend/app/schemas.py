from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, List, Any


class ScrapeRules(BaseModel):
    start_urls: List[str] = Field(default_factory=list)
    allowed_domains: List[str] = Field(default_factory=list)
    follow_links: bool = False
    max_pages: int = 100
    delay: float = 0.5
    user_agent: str = "Mozilla/5.0 (compatible; SpiderPlatform/1.0)"
    custom_headers: Dict[str, str] = Field(default_factory=dict)
    extract_patterns: Dict[str, str] = Field(default_factory=dict)


class SpiderScriptBase(BaseModel):
    name: str
    description: str = ""
    code: str


class SpiderScriptCreate(SpiderScriptBase):
    pass


class SpiderScriptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None


class SpiderScript(SpiderScriptBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SpiderTaskBase(BaseModel):
    name: str
    description: str = ""
    script_id: int
    cron_expression: str = ""
    is_enabled: bool = True
    scrape_rules: ScrapeRules = Field(default_factory=ScrapeRules)
    timeout: int = 60
    max_retries: int = 3


class SpiderTaskCreate(SpiderTaskBase):
    pass


class SpiderTaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    script_id: Optional[int] = None
    cron_expression: Optional[str] = None
    is_enabled: Optional[bool] = None
    scrape_rules: Optional[ScrapeRules] = None
    timeout: Optional[int] = None
    max_retries: Optional[int] = None


class SpiderTask(SpiderTaskBase):
    id: int
    created_at: datetime
    updated_at: datetime
    script: Optional[SpiderScript] = None

    class Config:
        from_attributes = True


class SpiderJobBase(BaseModel):
    task_id: int
    status: str = "pending"
    error_message: str = ""


class SpiderJobCreate(SpiderJobBase):
    pass


class SpiderJobUpdate(BaseModel):
    status: Optional[str] = None
    finished_at: Optional[datetime] = None
    duration: Optional[int] = None
    items_scraped: Optional[int] = None
    error_message: Optional[str] = None


class SpiderJob(SpiderJobBase):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration: int = 0
    items_scraped: int = 0
    task: Optional[SpiderTask] = None

    class Config:
        from_attributes = True


class SpiderResultBase(BaseModel):
    job_id: int
    url: str = ""
    data: Dict[str, Any] = Field(default_factory=dict)


class SpiderResultCreate(SpiderResultBase):
    pass


class SpiderResult(SpiderResultBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExecuteRequest(BaseModel):
    task_id: Optional[int] = None
    script_id: Optional[int] = None
    scrape_rules: Optional[ScrapeRules] = None
