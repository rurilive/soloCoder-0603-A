import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000
});

export const contentAPI = {
  submit: (data) => api.post('/contents', data),
  list: (status) => api.get('/contents', { params: { status } }),
  get: (id) => api.get(`/contents/${id}`),
  review: (id, data) => api.post(`/contents/${id}/review`, data),
  logs: (id) => api.get(`/contents/${id}/logs`),
  mlRecord: (id) => api.get(`/contents/${id}/ml-record`)
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

export default api;
