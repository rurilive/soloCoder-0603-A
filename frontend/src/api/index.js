import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (userData) => api.post('/users/register', userData),
  login: (credentials) => api.post('/users/login', credentials),
};

export const eventAPI = {
  getAll: () => api.get('/events'),
  getById: (id) => api.get(`/events/${id}`),
  getMyEvents: () => api.get('/events/my-events'),
  create: (eventData) => api.post('/events', eventData),
  update: (id, eventData) => api.put(`/events/${id}`, eventData),
  delete: (id) => api.delete(`/events/${id}`),
};

export const registrationAPI = {
  getMine: () => api.get('/registrations'),
  create: (data) => api.post('/registrations', data),
  getQRCode: (id) => api.get(`/registrations/${id}/qr-code`),
  checkIn: (ticketCode, deviceId) => api.post('/registrations/checkin', { ticket_code: ticketCode, device_id: deviceId }),
  getByEvent: (eventId) => api.get(`/registrations/event/${eventId}`),
};

export const deviceAPI = {
  create: (data) => api.post('/devices', data),
  getByEvent: (eventId) => api.get(`/devices/event/${eventId}`),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`),
  getCheckInStatistics: (eventId) => api.get(`/devices/event/${eventId}/checkin-statistics`),
  getCheckInRecords: (eventId) => api.get(`/devices/event/${eventId}/checkin-records`),
};

export const reportsAPI = {
  getStatistics: (eventId) => api.get(`/reports/event/${eventId}/statistics`),
  exportRegistrations: (eventId) => api.get(`/reports/event/${eventId}/export/registrations`, {
    responseType: 'blob'
  }),
  exportCheckins: (eventId) => api.get(`/reports/event/${eventId}/export/checkins`, {
    responseType: 'blob'
  }),
  exportFullReport: (eventId) => api.get(`/reports/event/${eventId}/export/full`, {
    responseType: 'blob'
  }),
};

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default api;