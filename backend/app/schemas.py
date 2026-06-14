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
    cleaning_pipeline_id: Optional[int] = None
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
    cleaning_pipeline_id: Optional[int] = None
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
    execution_id: str = ""
    retry_count: int = 0
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


class ExecuteCodeRequest(BaseModel):
    code: str
    scrape_rules: Optional[ScrapeRules] = None


class FieldSelector(BaseModel):
    name: str
    selector: str
    attribute: str = "text"
    required: bool = False
    description: str = ""


class ListCrawlConfig(BaseModel):
    list_url: str = ""
    item_selector: str = ""
    url_selector: str = ""
    url_attribute: str = "href"
    pagination_type: str = "none"
    pagination_selector: str = ""
    max_pages: int = 10
    fields: List[FieldSelector] = Field(default_factory=list)


class DetailCrawlConfig(BaseModel):
    fields: List[FieldSelector] = Field(default_factory=list)
    follow_links: bool = False
    link_selector: str = ""


class CommonCrawlConfig(BaseModel):
    allowed_domains: List[str] = Field(default_factory=list)
    delay: float = 0.5
    user_agent: str = "Mozilla/5.0 (compatible; SpiderPlatform/1.0)"
    custom_headers: Dict[str, str] = Field(default_factory=dict)
    timeout: int = 30


class VisualCrawlConfigBase(BaseModel):
    name: str
    description: str = ""
    crawl_type: str
    list_config: ListCrawlConfig = Field(default_factory=ListCrawlConfig)
    detail_config: DetailCrawlConfig = Field(default_factory=DetailCrawlConfig)
    common_config: CommonCrawlConfig = Field(default_factory=CommonCrawlConfig)


class VisualCrawlConfigCreate(VisualCrawlConfigBase):
    pass


class VisualCrawlConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    crawl_type: Optional[str] = None
    list_config: Optional[ListCrawlConfig] = None
    detail_config: Optional[DetailCrawlConfig] = None
    common_config: Optional[CommonCrawlConfig] = None


class VisualCrawlConfig(VisualCrawlConfigBase):
    id: int
    generated_script_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GenerateScriptRequest(BaseModel):
    config_id: int
    save_script: bool = True


class DebugSessionBase(BaseModel):
    script_id: Optional[int] = None
    code: str
    scrape_rules: Optional[ScrapeRules] = None


class DebugSessionCreate(DebugSessionBase):
    pass


class DebugCommand(BaseModel):
    command: str
    breakpoints: List[int] = Field(default_factory=list)


class DebugSessionState(BaseModel):
    session_id: str
    status: str
    current_line: int
    breakpoints: List[int]
    variables: Dict[str, Any]
    output: List[str]
    error: Optional[str] = None


class DebugSession(DebugSessionBase):
    id: int
    session_id: str
    status: str
    current_line: int
    breakpoints: List[int]
    variables: Dict[str, Any]
    output: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SelectorTestRequest(BaseModel):
    url: str
    selector: str
    attribute: str = "text"
    headers: Dict[str, str] = Field(default_factory=dict)


class CleaningRuleBase(BaseModel):
    rule_type: str
    field_name: str = ""
    params: Dict[str, Any] = Field(default_factory=dict)
    order_index: int = 0


class CleaningRuleCreate(CleaningRuleBase):
    pass


class CleaningRuleUpdate(BaseModel):
    rule_type: Optional[str] = None
    field_name: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    order_index: Optional[int] = None


class CleaningRule(CleaningRuleBase):
    id: int
    pipeline_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CleaningPipelineBase(BaseModel):
    name: str
    description: str = ""


class CleaningPipelineCreate(CleaningPipelineBase):
    rules: List[CleaningRuleCreate] = Field(default_factory=list)


class CleaningPipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[CleaningRuleCreate]] = None


class CleaningPipeline(CleaningPipelineBase):
    id: int
    rules: List[CleaningRule] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CleaningPreviewRequest(BaseModel):
    rules: List[CleaningRuleCreate]
    sample_data: List[Dict[str, Any]] = Field(default_factory=list)


class CleaningPreviewResponse(BaseModel):
    original: List[Dict[str, Any]]
    cleaned: List[Dict[str, Any]]
    rule_count: int


class RuleTypeInfo(BaseModel):
    type: str
    label: str
    category: str
    has_field: bool
    params: List[Dict[str, Any]]
