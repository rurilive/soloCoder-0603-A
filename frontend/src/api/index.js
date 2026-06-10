import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const hotelApi = {
  getHotels: (params) => api.get('/hotels', { params }),
  getHotel: (id) => api.get(`/hotels/${id}`),
  createHotel: (data) => api.post('/admin/hotels', data),
  updateHotel: (id, data) => api.put(`/admin/hotels/${id}`, data),
  deleteHotel: (id) => api.delete(`/admin/hotels/${id}`),
};

export const roomApi = {
  getRoom: (id) => api.get(`/admin/rooms/${id}`),
  createRoom: (hotelId, data) => api.post(`/admin/hotels/${hotelId}/rooms`, data),
  updateRoom: (id, data) => api.put(`/admin/rooms/${id}`, data),
  deleteRoom: (id) => api.delete(`/admin/rooms/${id}`),
};

export const bookingApi = {
  createBooking: (data) => api.post('/bookings', data),
};

export const orderApi = {
  getOrders: (params) => api.get('/orders', { params }),
  getOrder: (id) => api.get(`/orders/${id}`),
  updateOrderStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
};

export const statsApi = {
  getStats: () => api.get('/admin/stats'),
};

export const priceCalendarApi = {
  createPriceCalendar: (data) => api.post('/admin/price-calendars', data),
  batchCreatePriceCalendar: (data) => api.post('/admin/price-calendars/batch', data),
  getPriceCalendarsByRoom: (roomId) => api.get(`/admin/price-calendars/room/${roomId}`),
  getPriceCalendar: (id) => api.get(`/admin/price-calendars/${id}`),
  updatePriceCalendar: (id, data) => api.put(`/admin/price-calendars/${id}`, data),
  deletePriceCalendar: (id) => api.delete(`/admin/price-calendars/${id}`),
};

export const stayDiscountApi = {
  createStayDiscount: (data) => api.post('/admin/stay-discounts', data),
  getStayDiscountsByRoom: (roomId) => api.get(`/admin/stay-discounts/room/${roomId}`),
  getStayDiscount: (id) => api.get(`/admin/stay-discounts/${id}`),
  updateStayDiscount: (id, data) => api.put(`/admin/stay-discounts/${id}`, data),
  deleteStayDiscount: (id) => api.delete(`/admin/stay-discounts/${id}`),
};

export const pricingApi = {
  calculatePrice: (data) => api.post('/pricing/calculate', data),
};

export const reviewApi = {
  createReview: (data) => api.post('/reviews', data),
  getReviews: (params) => api.get('/reviews', { params }),
  getPendingReviews: (params) => api.get('/reviews/pending', { params }),
  getReview: (id) => api.get(`/reviews/${id}`),
  updateReviewStatus: (id, status) => api.put(`/reviews/${id}/status`, { status }),
  replyToReview: (id, reply) => api.put(`/reviews/${id}/reply`, { reply }),
  deleteReview: (id) => api.delete(`/reviews/${id}`),
  getHotelRating: (hotelId) => api.get(`/hotels/${hotelId}/rating`),
};

export default api;