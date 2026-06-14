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
  status: string;
  items_scraped: number;
  duration: number;
  results: Array<{ url: string; data: Record<string, any> }>;
  logs: string[];
  error?: string;
}

export interface ExecuteRequest {
  task_id?: number;
  script_id?: number;
  scrape_rules?: ScrapeRules;
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
