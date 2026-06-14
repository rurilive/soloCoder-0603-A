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

export default api;
