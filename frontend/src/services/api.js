import axios from 'axios'

const getCurrentUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('cms_current_user') || 'null')
    return user?.id || null
  } catch {
    return null
  }
}

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const userId = getCurrentUserId()
  if (userId) {
    config.headers['X-User-Id'] = userId
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const contentTypesApi = {
  list: (params) => api.get('/content-types/', { params }),
  get: (id) => api.get(`/content-types/${id}`),
  getBySlug: (slug) => api.get(`/content-types/slug/${slug}`),
  create: (data) => api.post('/content-types/', data),
  update: (id, data) => api.put(`/content-types/${id}`, data),
  delete: (id) => api.delete(`/content-types/${id}`),
}

export const fieldsApi = {
  list: (params) => api.get('/fields/', { params }),
  get: (id) => api.get(`/fields/${id}`),
  create: (contentTypeId, data) => api.post('/fields/', data, { params: { content_type_id: contentTypeId } }),
  update: (id, data) => api.put(`/fields/${id}`, data),
  delete: (id) => api.delete(`/fields/${id}`),
}

export const entriesApi = {
  list: (params) => api.get('/entries/', { params }),
  get: (id) => api.get(`/entries/${id}`),
  create: (data) => api.post('/entries/', data),
  update: (id, data) => api.put(`/entries/${id}`, data),
  delete: (id) => api.delete(`/entries/${id}`),
  publish: (id, languageCode) => api.post(`/entries/${id}/publish`, null, { params: languageCode ? { language_code: languageCode } : {} }),
  unpublish: (id, languageCode) => api.post(`/entries/${id}/unpublish`, null, { params: languageCode ? { language_code: languageCode } : {} }),
  listTranslations: (entryId) => api.get(`/entries/${entryId}/translations`),
  getTranslation: (entryId, languageCode) => api.get(`/entries/${entryId}/translations/${languageCode}`),
  createTranslation: (entryId, data) => api.post(`/entries/${entryId}/translations`, data),
  updateTranslation: (entryId, languageCode, data) => api.put(`/entries/${entryId}/translations/${languageCode}`, data),
  deleteTranslation: (entryId, languageCode) => api.delete(`/entries/${entryId}/translations/${languageCode}`),
  checkSlug: (slug, excludeEntryId) => api.get('/entries/check-slug', { params: { slug, exclude_entry_id: excludeEntryId } }),
}

export const usersApi = {
  login: (username, password) => api.post('/users/login', { username, password }),
  getMe: () => api.get('/users/me'),
  list: (params) => api.get('/users/', { params }),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  assignRoles: (id, roleIds) => api.post(`/users/${id}/roles`, { role_ids: roleIds }),
  activate: (id) => api.post(`/users/${id}/activate`),
  deactivate: (id) => api.post(`/users/${id}/deactivate`),
  listTranslators: () => api.get('/users/translators'),
  listReviewers: () => api.get('/users/reviewers'),
  listRoles: () => api.get('/users/roles/'),
  createRole: (data) => api.post('/users/roles/', data),
  updateRole: (id, data) => api.put(`/users/roles/${id}`, data),
  setRolePermissions: (id, permissionIds) => api.post(`/users/roles/${id}/permissions`, { permission_ids: permissionIds }),
  listPermissions: () => api.get('/users/permissions/'),
  createPermission: (data) => api.post('/users/permissions/', data),
}

export const translationApi = {
  create: (data) => api.post('/translation/', data),
  list: (params) => api.get('/translation/', { params }),
  get: (id) => api.get(`/translation/${id}`),
  update: (id, data) => api.put(`/translation/${id}`, data),
  assign: (id, assigneeId) => api.post(`/translation/${id}/assign`, { assignee_id: assigneeId }),
  updateStatus: (id, status, comment) => api.post(`/translation/${id}/status`, { status, comment }),
  addComment: (id, content, fieldName) => api.post(`/translation/${id}/comments`, { content, field_name: fieldName, task_id: id }),
  listComments: (id) => api.get(`/translation/${id}/comments`),
  listHistory: (id) => api.get(`/translation/${id}/history`),
  listReviews: (id) => api.get(`/translation/${id}/reviews`),
  createReview: (data) => api.post('/translation/reviews', data),
  updateReview: (id, data) => api.put(`/translation/reviews/${id}`, data),
  listPendingReviews: (params) => api.get('/translation/reviews/pending', { params }),
  getStats: (entryId) => api.get('/translation/stats', { params: entryId ? { entry_id: entryId } : {} }),
}

export const publicApi = {
  listContentTypes: () => api.get('/public/content-types'),
  getContentType: (slug) => api.get(`/public/content-types/${slug}`),
  listEntries: (contentTypeSlug, params) => api.get(`/public/entries/${contentTypeSlug}`, { params }),
  getEntryById: (contentTypeSlug, id, params) => api.get(`/public/entries/${contentTypeSlug}/by-id/${id}`, { params }),
  getEntryBySlug: (contentTypeSlug, slug, params) => api.get(`/public/entries/${contentTypeSlug}/by-slug/${slug}`, { params }),
  getLanguages: () => api.get('/public/languages'),
}

export const LANGUAGES = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
]

export const TASK_STATUS = {
  pending: { label: '待分配', color: '#9e9e9e' },
  assigned: { label: '已分配', color: '#2196f3' },
  in_progress: { label: '翻译中', color: '#ff9800' },
  completed: { label: '翻译完成', color: '#00bcd4' },
  reviewing: { label: '审校中', color: '#9c27b0' },
  approved: { label: '已通过', color: '#4caf50' },
  rejected: { label: '已驳回', color: '#f44336' },
}

export const TASK_PRIORITY = {
  low: { label: '低', color: '#9e9e9e' },
  normal: { label: '普通', color: '#2196f3' },
  high: { label: '高', color: '#ff9800' },
  urgent: { label: '紧急', color: '#f44336' },
}

export const ROLE_LABELS = {
  admin: { label: '管理员', color: '#9c27b0' },
  editor: { label: '编辑', color: '#2196f3' },
  translator: { label: '翻译', color: '#ff9800' },
  reviewer: { label: '审校', color: '#4caf50' },
}

export default api
