export interface ScrapeRules {
  start_urls: string[];
  allowed_domains: string[];
  follow_links: boolean;
  max_pages: number;
  delay: number;
  user_agent: string;
  custom_headers: Record<string, string>;
  extract_patterns: Record<string, string>;
}

export interface SpiderScript {
  id: number;
  name: string;
  description: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface SpiderScriptCreate {
  name: string;
  description?: string;
  code: string;
}

export interface SpiderScriptUpdate {
  name?: string;
  description?: string;
  code?: string;
}

export interface SpiderTask {
  id: number;
  name: string;
  description: string;
  script_id: number;
  cleaning_pipeline_id?: number;
  cron_expression: string;
  is_enabled: boolean;
  scrape_rules: ScrapeRules;
  timeout: number;
  max_retries: number;
  proxy_enabled?: boolean;
  proxy_tags?: string[];
  proxy_rotation_strategy?: string;
  rate_limit_enabled?: boolean;
  rate_limit_per_minute?: number;
  delay_min?: number;
  delay_max?: number;
  retry_on_proxy_fail?: number;
  created_at: string;
  updated_at: string;
  script?: SpiderScript;
  next_run_time?: string;
}

export interface SpiderTaskCreate {
  name: string;
  description?: string;
  script_id: number;
  cleaning_pipeline_id?: number;
  cron_expression?: string;
  is_enabled?: boolean;
  scrape_rules: ScrapeRules;
  timeout?: number;
  max_retries?: number;
  proxy_enabled?: boolean;
  proxy_tags?: string[];
  proxy_rotation_strategy?: string;
  rate_limit_enabled?: boolean;
  rate_limit_per_minute?: number;
  delay_min?: number;
  delay_max?: number;
  retry_on_proxy_fail?: number;
}

export interface SpiderTaskUpdate {
  name?: string;
  description?: string;
  script_id?: number;
  cleaning_pipeline_id?: number;
  cron_expression?: string;
  is_enabled?: boolean;
  scrape_rules?: ScrapeRules;
  timeout?: number;
  max_retries?: number;
  proxy_enabled?: boolean;
  proxy_tags?: string[];
  proxy_rotation_strategy?: string;
  rate_limit_enabled?: boolean;
  rate_limit_per_minute?: number;
  delay_min?: number;
  delay_max?: number;
  retry_on_proxy_fail?: number;
}

export interface SpiderJob {
  id: number;
  task_id: number;
  execution_id: string;
  retry_count: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at?: string;
  duration: number;
  items_scraped: number;
  error_message: string;
  task?: SpiderTask;
}

export interface SpiderResult {
  id: number;
  job_id: number;
  url: string;
  data: Record<string, any>;
  created_at: string;
}

export interface ExecuteResult {
  job_id: number;
  execution_id?: string;
  status: string;
  items_scraped: number;
  duration: number;
  results: Array<{ url: string; data: Record<string, any> }>;
  logs: string[];
  error?: string;
  retry_count?: number;
}

export interface ExecuteRequest {
  task_id?: number;
  script_id?: number;
  scrape_rules?: ScrapeRules;
}

export interface ExecuteCodeRequest {
  code: string;
  scrape_rules?: ScrapeRules;
}

export interface FieldSelector {
  name: string;
  selector: string;
  attribute: string;
  required: boolean;
  description: string;
}

export interface ListCrawlConfig {
  list_url: string;
  item_selector: string;
  url_selector: string;
  url_attribute: string;
  pagination_type: 'none' | 'next_page' | 'page_number' | 'infinite_scroll';
  pagination_selector: string;
  max_pages: number;
  fields: FieldSelector[];
}

export interface DetailCrawlConfig {
  fields: FieldSelector[];
  follow_links: boolean;
  link_selector: string;
}

export interface CommonCrawlConfig {
  allowed_domains: string[];
  delay: number;
  user_agent: string;
  custom_headers: Record<string, string>;
  timeout: number;
}

export interface VisualCrawlConfig {
  id: number;
  name: string;
  description: string;
  crawl_type: 'list' | 'detail' | 'list_detail';
  list_config: ListCrawlConfig;
  detail_config: DetailCrawlConfig;
  common_config: CommonCrawlConfig;
  generated_script_id?: number;
  created_at: string;
  updated_at: string;
}

export interface VisualCrawlConfigCreate {
  name: string;
  description?: string;
  crawl_type: 'list' | 'detail' | 'list_detail';
  list_config?: ListCrawlConfig;
  detail_config?: DetailCrawlConfig;
  common_config?: CommonCrawlConfig;
}

export interface VisualCrawlConfigUpdate {
  name?: string;
  description?: string;
  crawl_type?: 'list' | 'detail' | 'list_detail';
  list_config?: ListCrawlConfig;
  detail_config?: DetailCrawlConfig;
  common_config?: CommonCrawlConfig;
}

export interface SelectorTestRequest {
  url: string;
  selector: string;
  attribute?: string;
  headers?: Record<string, string>;
}

export interface SelectorTestResult {
  success: boolean;
  url: string;
  selector: string;
  attribute: string;
  matches: number;
  results: Array<{
    index: number;
    value: string;
    html: string;
  }>;
  error?: string;
}

export interface GenerateScriptResponse {
  script_id: number;
  script_name: string;
  code: string;
  scrape_rules: ScrapeRules;
}

export interface PreviewScriptResponse {
  code: string;
  scrape_rules: ScrapeRules;
}

export interface DebugSession {
  id: number;
  session_id: string;
  script_id?: number;
  code: string;
  scrape_rules?: ScrapeRules;
  status: 'idle' | 'running' | 'paused' | 'finished' | 'error' | 'stopped';
  current_line: number;
  breakpoints: number[];
  variables: Record<string, any>;
  output: string[];
  created_at: string;
  updated_at: string;
}

export interface DebugSessionCreate {
  script_id?: number;
  code: string;
  scrape_rules?: ScrapeRules;
}

export interface DebugCommandRequest {
  session_id: string;
  command: 'step' | 'continue' | 'stop' | 'next' | 'return';
  breakpoints?: number[];
}

export interface DebugSessionState {
  session_id: string;
  status: 'idle' | 'running' | 'paused' | 'finished' | 'error' | 'stopped';
  current_line: number;
  breakpoints: number[];
  variables: Record<string, any>;
  output: string[];
  error?: string;
}

export interface Stats {
  jobs: {
    total: number;
    completed: number;
    running: number;
    failed: number;
  };
  items_scraped: number;
  tasks: {
    total: number;
    enabled: number;
  };
}

export interface CleaningRule {
  id: number;
  pipeline_id: number;
  rule_type: string;
  field_name: string;
  params: Record<string, any>;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CleaningRuleCreate {
  rule_type: string;
  field_name?: string;
  params: Record<string, any>;
  order_index?: number;
}

export interface CleaningPipeline {
  id: number;
  name: string;
  description: string;
  rules: CleaningRule[];
  created_at: string;
  updated_at: string;
}

export interface CleaningPipelineCreate {
  name: string;
  description?: string;
  rules?: CleaningRuleCreate[];
}

export interface CleaningPipelineUpdate {
  name?: string;
  description?: string;
  rules?: CleaningRuleCreate[];
}

export interface RuleTypeParam {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  default?: any;
  options?: string[];
}

export interface RuleTypeInfo {
  type: string;
  label: string;
  category: string;
  has_field: boolean;
  params: RuleTypeParam[];
}

export interface CleaningPreviewResponse {
  original: Record<string, any>[];
  cleaned: Record<string, any>[];
  rule_count: number;
}

export interface Proxy {
  id: number;
  ip: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5' | string;
  username?: string;
  password?: string;
  status: 'active' | 'inactive' | 'checking' | 'failed' | string;
  success_count: number;
  fail_count: number;
  last_check_at?: string;
  last_used_at?: string;
  response_time: number;
  tags: string[];
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface ProxyCreate {
  ip: string;
  port: number;
  protocol?: string;
  username?: string;
  password?: string;
  status?: string;
  tags?: string[];
  remark?: string;
}

export interface ProxyUpdate {
  ip?: string;
  port?: number;
  protocol?: string;
  username?: string;
  password?: string;
  status?: string;
  tags?: string[];
  remark?: string;
}

export interface ProxyCheckLog {
  id: number;
  proxy_id: number;
  success: boolean;
  response_time: number;
  status_code?: number;
  error_message: string;
  checked_at: string;
}

export interface ProxyStats {
  total: number;
  active: number;
  inactive: number;
  checking: number;
  failed: number;
  by_protocol: Record<string, number>;
  avg_success_rate: number;
  avg_response_time: number;
}

export interface ProxySettings {
  proxy_check_enabled: boolean;
  proxy_check_interval: number;
  proxy_check_url: string;
  proxy_check_timeout: number;
  default_proxy_rotation_strategy: string;
  default_rate_limit_per_minute: number;
  default_delay_min: number;
  default_delay_max: number;
}

export interface CheckResult {
  proxy_id: number;
  success: boolean;
  response_time: number;
  status_code?: number;
  error_message: string;
}

export interface BatchCheckResponse {
  total: number;
  success: number;
  failed: number;
  results: CheckResult[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}
