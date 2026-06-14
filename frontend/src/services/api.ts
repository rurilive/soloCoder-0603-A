import axios from 'axios';
import type {
  SpiderScript,
  SpiderScriptCreate,
  SpiderScriptUpdate,
  SpiderTask,
  SpiderTaskCreate,
  SpiderTaskUpdate,
  SpiderJob,
  SpiderResult,
  ExecuteResult,
  ExecuteRequest,
  Stats,
  VisualCrawlConfig,
  VisualCrawlConfigCreate,
  VisualCrawlConfigUpdate,
  SelectorTestRequest,
  SelectorTestResult,
  GenerateScriptResponse,
  PreviewScriptResponse,
  DebugSession,
  DebugSessionCreate,
  DebugCommandRequest,
  DebugSessionState,
  CleaningPipeline,
  CleaningPipelineCreate,
  CleaningPipelineUpdate,
  RuleTypeInfo,
  CleaningPreviewResponse,
  Proxy,
  ProxyCreate,
  ProxyUpdate,
  ProxyStats,
  ProxySettings,
  CheckResult,
  BatchCheckResponse,
  ProxyCheckLog,
  PaginatedResponse,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export const scriptApi = {
  list: () => api.get<SpiderScript[]>('/scripts'),
  get: (id: number) => api.get<SpiderScript>(`/scripts/${id}`),
  create: (data: SpiderScriptCreate) => api.post<SpiderScript>('/scripts', data),
  update: (id: number, data: SpiderScriptUpdate) => api.put<SpiderScript>(`/scripts/${id}`, data),
  delete: (id: number) => api.delete(`/scripts/${id}`),
};

export const taskApi = {
  list: () => api.get<SpiderTask[]>('/tasks'),
  get: (id: number) => api.get<SpiderTask>(`/tasks/${id}`),
  create: (data: SpiderTaskCreate) => api.post<SpiderTask>('/tasks', data),
  update: (id: number, data: SpiderTaskUpdate) => api.put<SpiderTask>(`/tasks/${id}`, data),
  delete: (id: number) => api.delete(`/tasks/${id}`),
  run: (id: number) => api.post<ExecuteResult>(`/tasks/${id}/run`),
  toggle: (id: number) => api.post<{ id: number; is_enabled: boolean }>(`/tasks/${id}/toggle`),
};

export const executeApi = {
  execute: (data: ExecuteRequest) => api.post<ExecuteResult>('/execute', data),
  executeCode: (code: string, scrape_rules?: any) =>
    api.post<ExecuteResult>('/execute/code', { code, scrape_rules }),
};

export const resultsApi = {
  listJobs: (taskId?: number, status?: string, limit = 50, offset = 0) =>
    api.get<SpiderJob[]>('/results/jobs', {
      params: { task_id: taskId, status, limit, offset },
    }),
  getJob: (id: number) => api.get<SpiderJob>(`/results/jobs/${id}`),
  getJobResults: (jobId: number, limit = 100, offset = 0) =>
    api.get<SpiderResult[]>(`/results/jobs/${jobId}/results`, { params: { limit, offset } }),
  exportResults: (jobId: number, format: 'json' | 'csv') =>
    api.get(`/results/jobs/${jobId}/export/${format}`, { responseType: 'blob' }),
  getStats: () => api.get<Stats>('/results/stats'),
};

export const visualConfigApi = {
  list: () => api.get<VisualCrawlConfig[]>('/visual-config'),
  get: (id: number) => api.get<VisualCrawlConfig>(`/visual-config/${id}`),
  create: (data: VisualCrawlConfigCreate) => api.post<VisualCrawlConfig>('/visual-config', data),
  update: (id: number, data: VisualCrawlConfigUpdate) =>
    api.put<VisualCrawlConfig>(`/visual-config/${id}`, data),
  delete: (id: number) => api.delete(`/visual-config/${id}`),
  generateScript: (id: number) =>
    api.post<GenerateScriptResponse>(`/visual-config/${id}/generate-script`),
  previewScript: (id: number) =>
    api.post<PreviewScriptResponse>(`/visual-config/${id}/preview-script`),
  testSelector: (data: SelectorTestRequest) =>
    api.post<SelectorTestResult>('/visual-config/test-selector', data),
};

export const debugApi = {
  listSessions: () => api.get<DebugSession[]>('/debug/sessions'),
  getSession: (sessionId: string) => api.get<DebugSession>(`/debug/sessions/${sessionId}`),
  createSession: (data: DebugSessionCreate) => api.post<DebugSession>('/debug/sessions', data),
  startSession: (sessionId: string) =>
    api.post<DebugSessionState>(`/debug/sessions/${sessionId}/start`),
  executeCommand: (sessionId: string, command: DebugCommandRequest) =>
    api.post<DebugSessionState>(`/debug/sessions/${sessionId}/command`, command),
  getState: (sessionId: string) => api.get<DebugSessionState>(`/debug/sessions/${sessionId}/state`),
  stopSession: (sessionId: string) => api.post(`/debug/sessions/${sessionId}/stop`),
};

export const cleaningApi = {
  listRuleTypes: () => api.get<RuleTypeInfo[]>('/cleaning/rule-types'),
  listPipelines: () => api.get<CleaningPipeline[]>('/cleaning/pipelines'),
  getPipeline: (id: number) => api.get<CleaningPipeline>(`/cleaning/pipelines/${id}`),
  createPipeline: (data: CleaningPipelineCreate) =>
    api.post<CleaningPipeline>('/cleaning/pipelines', data),
  updatePipeline: (id: number, data: CleaningPipelineUpdate) =>
    api.put<CleaningPipeline>(`/cleaning/pipelines/${id}`, data),
  deletePipeline: (id: number) => api.delete(`/cleaning/pipelines/${id}`),
  preview: (rules: any[], sampleData: Record<string, any>[]) =>
    api.post<CleaningPreviewResponse>('/cleaning/preview', { rules, sample_data: sampleData }),
  previewPipeline: (id: number, sampleData: Record<string, any>[]) =>
    api.post<CleaningPreviewResponse>(`/cleaning/pipelines/${id}/preview`, sampleData),
};

export const proxyApi = {
  list: (skip = 0, limit = 100, params?: { status?: string; protocol?: string; tag?: string; keyword?: string }) =>
    api.get<PaginatedResponse<Proxy>>('/proxies', { params: { skip, limit, ...params } }),
  get: (id: number) => api.get<Proxy>(`/proxies/${id}`),
  create: (data: ProxyCreate) => api.post<Proxy>('/proxies', data),
  batchImport: (text: string) => api.post<{ imported: number; skipped: any[]; total: number }>('/proxies/batch', { text }),
  update: (id: number, data: ProxyUpdate) => api.put<Proxy>(`/proxies/${id}`, data),
  delete: (id: number) => api.delete(`/proxies/${id}`),
  batchDelete: (ids: number[]) => api.delete<{ deleted: number }>('/proxies/batch', { data: { ids } }),
  check: (id: number) => api.post<CheckResult>(`/proxies/${id}/check`),
  batchCheck: (params?: { ids?: number[]; status?: string; protocol?: string; tags?: string[] }) =>
    api.post<BatchCheckResponse>('/proxies/batch-check', params || {}),
  getStats: () => api.get<ProxyStats>('/proxies/stats'),
  getCheckLogs: (proxyId: number, skip = 0, limit = 50) =>
    api.get<PaginatedResponse<ProxyCheckLog>>(`/proxies/check-logs/${proxyId}`, { params: { skip, limit } }),
  getSettings: () => api.get<ProxySettings>('/proxies/settings'),
  updateSettings: (data: ProxySettings) => api.put<ProxySettings>('/proxies/settings', data),
};

export default api;
