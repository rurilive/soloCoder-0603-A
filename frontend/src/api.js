import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
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
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (username, password) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    return api.post('/auth/login', formData)
  },
  getMe: () => api.get('/auth/me'),
}

export const documentAPI = {
  list: () => api.get('/documents'),
  get: (id) => api.get(`/documents/${id}`),
  upload: (formData, onProgress) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(Math.round((e.loaded * 100) / e.total))
        : undefined,
    }),
  convert: (id, watermarkEnabled, watermarkText) => {
    const formData = new FormData()
    formData.append('watermark_enabled', watermarkEnabled)
    if (watermarkText) formData.append('watermark_text', watermarkText)
    return api.post(`/documents/${id}/convert`, formData)
  },
  update: (id, data) => api.put(`/documents/${id}`, data),
  delete: (id) => api.delete(`/documents/${id}`),
  getPreviewInfo: (id) => api.get(`/documents/${id}/preview/info`),
  getPreviewUrl: (id, page) => {
    const token = localStorage.getItem('token') || ''
    let url = `/api/documents/${id}/preview?token=${encodeURIComponent(token)}`
    if (page) url += `&page=${page}`
    url += `&_t=${Date.now()}`
    return url
  },
  listAnnotations: (id, page) => {
    const params = {}
    if (page !== undefined && page !== null) params.page = page
    return api.get(`/documents/${id}/annotations`, { params })
  },
  createAnnotation: (id, data) => api.post(`/documents/${id}/annotations`, data),
  updateAnnotation: (id, annId, data) =>
    api.put(`/documents/${id}/annotations/${annId}`, data),
  deleteAnnotation: (id, annId) =>
    api.delete(`/documents/${id}/annotations/${annId}`),
  createReply: (id, annId, data) =>
    api.post(`/documents/${id}/annotations/${annId}/replies`, data),
  updateReply: (id, annId, replyId, data) =>
    api.put(`/documents/${id}/annotations/${annId}/replies/${replyId}`, data),
  deleteReply: (id, annId, replyId) =>
    api.delete(`/documents/${id}/annotations/${annId}/replies/${replyId}`),
  getAnnotationsWsUrl: (id) => {
    const token = localStorage.getItem('token') || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/documents/${id}/annotations/ws?token=${encodeURIComponent(token)}`
  },
  getContent: (id) => api.get(`/documents/${id}/content`),
  updateContent: (id, data) => api.put(`/documents/${id}/content`, data),
  listVersions: (id, skip = 0, limit = 20) =>
    api.get(`/documents/${id}/versions`, { params: { skip, limit } }),
  getVersion: (id, versionId) => api.get(`/documents/${id}/versions/${versionId}`),
  restoreVersion: (id, versionId) =>
    api.post(`/documents/${id}/versions/${versionId}/restore`),
  getOnlineEditors: (id) => api.get(`/documents/${id}/editors`),
  getEditWsUrl: (id) => {
    const token = localStorage.getItem('token') || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/documents/${id}/edit/ws?token=${encodeURIComponent(token)}`
  },
}

export default api
