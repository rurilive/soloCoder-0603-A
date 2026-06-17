import axios from 'axios';

export const authEventBus = {
  listeners: new Set(),
  onAuthRequired(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },
  emitAuthRequired() {
    this.listeners.forEach(cb => cb());
  }
};

const api = axios.create({
  baseURL: '/api',
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('current_user');
      authEventBus.emitAuthRequired();
    }
    return Promise.reject(error);
  }
);

export const contentAPI = {
  submit: (data) => api.post('/contents', data),
  list: (params) => api.get('/contents', { params }),
  get: (id) => api.get(`/contents/${id}`),
  review: (id, data) => api.post(`/contents/${id}/review`, data),
  logs: (id) => api.get(`/contents/${id}/logs`),
  mlRecord: (id) => api.get(`/contents/${id}/ml-record`),
  batchReview: (data) => api.post('/contents/batch-review', data),
  assign: (data) => api.post('/contents/assign', data)
};

export const authAPI = {
  login: (data) => api.post('/auth/login', data)
};

export const userAPI = {
  listReviewers: () => api.get('/users/reviewers'),
  getReviewerStats: () => api.get('/users/reviewers/stats'),
  getCurrentUser: (token) => api.get('/users/me', { params: { token } })
};

export const rulesAPI = {
  list: () => api.get('/rules'),
  create: (data) => api.post('/rules', data),
  update: (id, data) => api.put(`/rules/${id}`, data),
  delete: (id) => api.delete(`/rules/${id}`)
};

export const statsAPI = {
  get: () => api.get('/stats')
};

export const healthAPI = {
  check: () => api.get('/health')
};

export const mlThresholdAPI = {
  list: () => api.get('/ml/thresholds'),
  active: () => api.get('/ml/thresholds/active'),
  create: (data) => api.post('/ml/thresholds', data),
  update: (id, data) => api.put(`/ml/thresholds/${id}`, data),
  delete: (id) => api.delete(`/ml/thresholds/${id}`),
  activate: (id) => api.put(`/ml/thresholds/${id}/activate`)
};

export const mlRecordsAPI = {
  list: (skip, limit) => api.get('/ml/records', { params: { skip, limit } })
};

export const mlHealthAPI = {
  check: () => api.get('/ml/health')
};

export const samplingAPI = {
  run: (data) => api.post('/sampling/run', data),
  listBatches: (status) => api.get('/sampling/batches', { params: { status } }),
  getBatch: (batchId) => api.get(`/sampling/batches/${batchId}`),
  getBatchReviews: (batchId) => api.get(`/sampling/batches/${batchId}/reviews`),
  pendingReviews: () => api.get('/sampling/reviews/pending'),
  review: (reviewId, data) => api.post(`/sampling/reviews/${reviewId}`, data)
};

export const performanceAPI = {
  getReviewerPerformance: (startDate, endDate) =>
    api.get('/reviewers/performance', { params: { start_date: startDate, end_date: endDate } })
};

export const versionAPI = {
  listVersions: (contentId) => api.get(`/contents/${contentId}/versions`),
  getVersion: (contentId, versionNumber) => api.get(`/contents/${contentId}/versions/${versionNumber}`),
  getDiff: (contentId, oldVersion, newVersion) =>
    api.get(`/contents/${contentId}/diff`, { params: { old_version: oldVersion, new_version: newVersion } }),
  resubmit: (contentId, data) => api.post(`/contents/${contentId}/resubmit`, data)
};

export default api;
