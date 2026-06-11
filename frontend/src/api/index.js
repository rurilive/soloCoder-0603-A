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
  create: (eventData) => api.post('/events', eventData),
  update: (id, eventData) => api.put(`/events/${id}`, eventData),
  delete: (id) => api.delete(`/events/${id}`),
};

export const registrationAPI = {
  getMine: () => api.get('/registrations'),
  create: (data) => api.post('/registrations', data),
  getQRCode: (id) => api.get(`/registrations/${id}/qr-code`),
  checkIn: (ticketCode) => api.post('/registrations/checkin', { ticket_code: ticketCode }),
  getByEvent: (eventId) => api.get(`/registrations/event/${eventId}`),
};

export default api;