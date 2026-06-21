import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
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
}

export const publicApi = {
  listContentTypes: () => api.get('/public/content-types'),
  getContentType: (slug) => api.get(`/public/content-types/${slug}`),
  listEntries: (contentTypeSlug, params) => api.get(`/public/entries/${contentTypeSlug}`, { params }),
  getEntryById: (contentTypeSlug, id, params) => api.get(`/public/entries/${contentTypeSlug}/by-id/${id}`, { params }),
  getEntryBySlug: (contentTypeSlug, slug, params) => api.get(`/public/entries/${contentTypeSlug}/by-slug/${slug}`, { params }),
  getLanguages: () => api.get('/public/languages'),
}

export default api
