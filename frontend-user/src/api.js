import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const login = (data) => api.post('/auth/login', data)
export const register = (data) => api.post('/auth/register', data)
export const getMe = () => api.get('/auth/me')
export const createTicket = (data) => api.post('/tickets/', data)
export const getMyTickets = (params) => api.get('/tickets/', { params })
export const getTicketDetail = (id) => api.get(`/tickets/${id}`)
export const sendMessage = (ticketId, data) => api.post(`/tickets/${ticketId}/messages`, data)
export const getMessages = (ticketId) => api.get(`/tickets/${ticketId}/messages`)
export const rateTicket = (ticketId, data) => api.post(`/ratings/${ticketId}/rating`, data)
export const closeTicket = (ticketId) => api.post(`/tickets/${ticketId}/close`)
export const reopenTicket = (ticketId) => api.post(`/tickets/${ticketId}/reopen`)
export const getRecommendations = (data) => api.post('/recommendations/recommendations', data)

export default api
