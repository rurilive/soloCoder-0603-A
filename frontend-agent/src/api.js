import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const login = (data) => api.post('/auth/login', data);

export const getMe = () => api.get('/auth/me');

export const getTickets = (params) => api.get('/tickets/', { params });

export const getTicketDetail = (id) => api.get(`/tickets/${id}`);

export const acceptTicket = (id) => api.post(`/tickets/${id}/accept`);

export const resolveTicket = (id) => api.post(`/tickets/${id}/resolve`);

export const escalateTicket = (id, data) =>
  api.post(`/tickets/${id}/escalate`, data);

export const transferTicket = (id, data) =>
  api.post(`/tickets/${id}/transfer`, data);

export const sendMessage = (ticketId, data) =>
  api.post(`/tickets/${ticketId}/messages`, data);

export const getMessages = (ticketId) =>
  api.get(`/tickets/${ticketId}/messages`);

export const getTicketStats = () => api.get('/tickets/stats');

export const getAgents = () => api.get('/auth/agents');

export const getSLARules = (params) => api.get('/sla/rules', { params });

export const createSLARule = (data) => api.post('/sla/rules', data);

export const updateSLARule = (id, data) => api.put(`/sla/rules/${id}`, data);

export const deleteSLARule = (id) => api.delete(`/sla/rules/${id}`);

export const getTicketSLA = (ticketId) => api.get(`/sla/ticket/${ticketId}`);

export const getTicketSLAStatus = (ticketId) => api.get(`/sla/ticket/${ticketId}/status`);

export default api;
