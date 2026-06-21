import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { contentTypesApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

export default function ContentTypeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useApp()
  const isEdit = !!id
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    is_active: true,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit) loadData()
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await contentTypesApi.get(id)
      setForm({
        name: res.data.name,
        slug: res.data.slug,
        description: res.data.description || '',
        is_active: res.data.is_active,
      })
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) {
      showToast('请填写名称和Slug', 'error')
      return
    }
    try {
      setSaving(true)
      if (isEdit) {
        await contentTypesApi.update(id, form)
        showToast('更新成功')
      } else {
        const res = await contentTypesApi.create(form)
        showToast('创建成功')
        navigate(`/content-types/${res.data.id}/fields`)
        return
      }
      navigate('/content-types')
    } catch (e) {
      showToast('保存失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <div className="page-header"><h1 className="page-title">加载中...</h1></div>
        <div className="page-body"><div className="card"><div className="empty-state">加载中...</div></div></div>
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{isEdit ? '编辑内容类型' : '新建内容类型'}</h1>
        <Link to="/content-types" className="btn btn-secondary">返回</Link>
      </div>
      <div className="page-body">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">名称 *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="例如：文章、产品"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Slug *</label>
                <input
                  type="text"
                  name="slug"
                  className="form-input"
                  value={form.slug}
                  onChange={handleChange}
                  placeholder="例如：article, product"
                  disabled={isEdit}
                />
                {isEdit && <small style={{ color: '#6b7280' }}>Slug创建后不可修改</small>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">描述</label>
              <textarea
                name="description"
                className="form-textarea"
                value={form.description}
                onChange={handleChange}
                placeholder="简要描述这个内容类型的用途"
              />
            </div>
            <div className="form-check">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={form.is_active}
                onChange={handleChange}
              />
              <label htmlFor="is_active" className="form-label" style={{ margin: 0 }}>启用此内容类型</label>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '保存中...' : (isEdit ? '保存修改' : '创建并配置字段')}
              </button>
              <Link to="/content-types" className="btn btn-secondary">取消</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
