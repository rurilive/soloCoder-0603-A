import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
});

export const contentAPI = {
  submit: (data) => api.post('/contents', data),
  list: (status) => api.get('/contents', { params: { status } }),
  get: (id) => api.get(`/contents/${id}`),
  review: (id, data) => api.post(`/contents/${id}/review`, data),
  logs: (id) => api.get(`/contents/${id}/logs`)
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

export default api;
