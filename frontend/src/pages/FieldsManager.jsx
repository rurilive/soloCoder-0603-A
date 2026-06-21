import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { contentTypesApi, fieldsApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'

const FIELD_TYPES = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'richtext', label: '富文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔值' },
  { value: 'date', label: '日期' },
  { value: 'image', label: '图片' },
  { value: 'file', label: '文件' },
  { value: 'select', label: '下拉选择' },
  { value: 'json', label: 'JSON' },
]

export default function FieldsManager() {
  const { id } = useParams()
  const { showToast } = useApp()
  const [contentType, setContentType] = useState(null)
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [form, setForm] = useState({
    name: '',
    label: '',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    is_translatable: true,
    sort_order: 0,
    description: '',
    default_value: '',
    options: '',
  })

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [ctRes, fieldsRes] = await Promise.all([
        contentTypesApi.get(id),
        fieldsApi.list({ content_type_id: id, limit: 500 }),
      ])
      setContentType(ctRes.data)
      setFields(fieldsRes.data.sort((a, b) => a.sort_order - b.sort_order))
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingField(null)
    setForm({
      name: '',
      label: '',
      field_type: 'text',
      is_required: false,
      is_unique: false,
      is_translatable: true,
      sort_order: fields.length + 1,
      description: '',
      default_value: '',
      options: '',
    })
    setShowModal(true)
  }

  const openEditModal = (field) => {
    setEditingField(field)
    setForm({
      name: field.name,
      label: field.label,
      field_type: field.field_type,
      is_required: field.is_required,
      is_unique: field.is_unique,
      is_translatable: field.is_translatable,
      sort_order: field.sort_order,
      description: field.description || '',
      default_value: field.default_value != null ? String(field.default_value) : '',
      options: field.options ? JSON.stringify(field.options, null, 2) : '',
    })
    setShowModal(true)
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
    if (!form.name.trim() || !form.label.trim()) {
      showToast('请填写字段名和标签', 'error')
      return
    }

    let payload = { ...form }
    if (payload.field_type === 'select' && form.options.trim()) {
      try {
        payload.options = JSON.parse(form.options)
      } catch {
        showToast('选项JSON格式错误', 'error')
        return
      }
    } else {
      delete payload.options
    }

    if (form.default_value.trim() === '') {
      payload.default_value = null
    }

    payload.sort_order = Number(form.sort_order) || 0

    try {
      if (editingField) {
        await fieldsApi.update(editingField.id, payload)
        showToast('字段更新成功')
      } else {
        await fieldsApi.create(id, payload)
        showToast('字段创建成功')
      }
      setShowModal(false)
      loadData()
    } catch (e) {
      showToast('保存失败: ' + (e.response?.data?.detail || e.message), 'error')
    }
  }

  const handleDelete = async (field) => {
    if (!window.confirm(`确定删除字段「${field.label}」吗？`)) return
    try {
      await fieldsApi.delete(field.id)
      showToast('删除成功')
      loadData()
    } catch (e) {
      showToast('删除失败: ' + (e.response?.data?.detail || e.message), 'error')
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
        <div>
          <h1 className="page-title">字段配置 - {contentType?.name}</h1>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Slug: <code>{contentType?.slug}</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/entries/${contentType?.slug}`} className="btn btn-secondary">管理条目</Link>
          <Link to="/content-types" className="btn btn-secondary">返回列表</Link>
          <button className="btn btn-primary" onClick={openCreateModal}>+ 添加字段</button>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          {fields.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">暂无字段</div>
              <p>点击"添加字段"按钮为该内容类型创建自定义字段</p>
            </div>
          ) : (
            <div>
              {fields.map((field) => (
                <div key={field.id} className="field-card">
                  <div className="field-card-header">
                    <div>
                      <span className="field-name">{field.label}</span>
                      <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>
                        <code>{field.name}</code>
                      </span>
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge-info" style={{ marginRight: 6 }}>
                          {FIELD_TYPES.find((t) => t.value === field.field_type)?.label || field.field_type}
                        </span>
                        {field.is_required && <span className="badge badge-danger" style={{ marginRight: 6 }}>必填</span>}
                        {field.is_unique && <span className="badge badge-warning" style={{ marginRight: 6 }}>唯一</span>}
                        {field.is_translatable ? (
                          <span className="badge badge-success">可翻译</span>
                        ) : (
                          <span className="badge badge-info">不翻译</span>
                        )}
                        {field.description && (
                          <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>{field.description}</span>
                        )}
                      </div>
                    </div>
                    <div className="action-buttons">
                      <span style={{ color: '#6b7280', fontSize: 12 }}>排序: {field.sort_order}</span>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(field)}>编辑</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(field)}>删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingField ? '编辑字段' : '添加字段'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              {editingField ? '保存修改' : '添加字段'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">字段名 (英文) *</label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={form.name}
                onChange={handleChange}
                placeholder="例如：title, body"
              />
            </div>
            <div className="form-group">
              <label className="form-label">显示标签 *</label>
              <input
                type="text"
                name="label"
                className="form-input"
                value={form.label}
                onChange={handleChange}
                placeholder="例如：标题, 正文"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">字段类型</label>
              <select name="field_type" className="form-select" value={form.field_type} onChange={handleChange}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">排序</label>
              <input
                type="number"
                name="sort_order"
                className="form-input"
                value={form.sort_order}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <input
              type="text"
              name="description"
              className="form-input"
              value={form.description}
              onChange={handleChange}
              placeholder="字段使用说明"
            />
          </div>
          <div className="form-group">
            <label className="form-label">默认值</label>
            <input
              type="text"
              name="default_value"
              className="form-input"
              value={form.default_value}
              onChange={handleChange}
              placeholder="留空表示无默认值"
            />
          </div>
          {form.field_type === 'select' && (
            <div className="form-group">
              <label className="form-label">选项 (JSON数组，如 [{"{"}"label":"选项1","value":"val1"{"}"}])</label>
              <textarea
                name="options"
                className="form-textarea"
                value={form.options}
                onChange={handleChange}
                placeholder='[{"label":"选项1","value":"val1"}]'
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 20 }}>
            <div className="form-check">
              <input type="checkbox" id="is_required" name="is_required" checked={form.is_required} onChange={handleChange} />
              <label htmlFor="is_required" className="form-label" style={{ margin: 0 }}>必填字段</label>
            </div>
            <div className="form-check">
              <input type="checkbox" id="is_unique" name="is_unique" checked={form.is_unique} onChange={handleChange} />
              <label htmlFor="is_unique" className="form-label" style={{ margin: 0 }}>值唯一</label>
            </div>
            <div className="form-check">
              <input type="checkbox" id="is_translatable" name="is_translatable" checked={form.is_translatable} onChange={handleChange} />
              <label htmlFor="is_translatable" className="form-label" style={{ margin: 0 }}>支持多语言翻译</label>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}
