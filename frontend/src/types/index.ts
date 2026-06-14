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
  cron_expression: string;
  is_enabled: boolean;
  scrape_rules: ScrapeRules;
  timeout: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
  script?: SpiderScript;
  next_run_time?: string;
}

export interface SpiderTaskCreate {
  name: string;
  description?: string;
  script_id: number;
  cron_expression?: string;
  is_enabled?: boolean;
  scrape_rules: ScrapeRules;
  timeout?: number;
  max_retries?: number;
}

export interface SpiderTaskUpdate {
  name?: string;
  description?: string;
  script_id?: number;
  cron_expression?: string;
  is_enabled?: boolean;
  scrape_rules?: ScrapeRules;
  timeout?: number;
  max_retries?: number;
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
