import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { publicApi, entriesApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

function slugify(str, languageCode) {
  let base = String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (languageCode) {
    base = base + '-' + languageCode
  }
  return base
}

async function generateUniqueSlug(title, languageCode, excludeEntryId = null) {
  if (!title?.trim()) return ''
  let baseSlug = slugify(title, languageCode)
  let candidate = baseSlug
  let counter = 1
  const maxAttempts = 100

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await entriesApi.checkSlug(candidate, excludeEntryId)
      if (res.data.available) {
        return candidate
      }
      counter++
      candidate = `${baseSlug}-${counter}`
    } catch (e) {
      console.warn('Slug check failed, using fallback:', candidate)
      return candidate
    }
  }
  return candidate
}

export default function EntryEdit() {
  const { contentTypeSlug, entryId } = useParams()
  const navigate = useNavigate()
  const { languages, defaultLanguage, languageNames, showToast } = useApp()
  const isEdit = !!entryId

  const [contentType, setContentType] = useState(null)
  const [fields, setFields] = useState([])
  const [currentLang, setCurrentLang] = useState(defaultLanguage)
  const [translations, setTranslations] = useState({})
  const [entryStatus, setEntryStatus] = useState('draft')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [contentTypeSlug, entryId])

  const loadData = async () => {
    try {
      setLoading(true)
      const ctRes = await publicApi.getContentType(contentTypeSlug)
      setContentType(ctRes.data)
      setFields(ctRes.data.fields)

      if (isEdit) {
        const entryRes = await entriesApi.get(entryId)
        const entry = entryRes.data
        setEntryStatus(entry.status)
        const transMap = {}
        entry.translations.forEach((t) => {
          transMap[t.language_code] = {
            title: t.title || '',
            slug: t.slug || '',
            is_published: t.is_published,
            field_values: { ...t.field_values },
          }
        })
        setTranslations(transMap)
      } else {
        const initial = {}
        languages.forEach((lang) => {
          initial[lang] = {
            title: '',
            slug: '',
            is_published: false,
            field_values: {},
          }
        })
        setTranslations(initial)
      }
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const getCurrentTrans = () => translations[currentLang] || { title: '', slug: '', field_values: {}, is_published: false }

  const updateCurrentTrans = (updater) => {
    setTranslations((prev) => {
      const next = { ...prev }
      const curr = next[currentLang] || { title: '', slug: '', field_values: {}, is_published: false }
      next[currentLang] = typeof updater === 'function' ? updater(curr) : { ...curr, ...updater }
      return next
    })
  }

  const handleFieldChange = (fieldName, value) => {
    updateCurrentTrans((curr) => ({
      ...curr,
      field_values: { ...curr.field_values, [fieldName]: value },
    }))
  }

  const handleTitleChange = (e) => {
    const title = e.target.value
    updateCurrentTrans((curr) => {
      const newSlug = curr.slug || slugify(title, currentLang)
      return {
        ...curr,
        title,
        slug: newSlug,
        field_values: { ...curr.field_values, title },
      }
    })
  }

  const handleSlugChange = (e) => {
    updateCurrentTrans({ slug: e.target.value })
  }

  const handlePublishedChange = (e) => {
    updateCurrentTrans({ is_published: e.target.checked })
  }

  const ensureTranslationExists = (lang) => {
    if (!translations[lang]) {
      setTranslations((prev) => ({
        ...prev,
        [lang]: { title: '', slug: '', field_values: {}, is_published: false },
      }))
    }
  }

  const handleSave = async (publishAll = false) => {
    const current = getCurrentTrans()
    if (!current.title?.trim()) {
      showToast(`请先填写${languageNames[currentLang] || currentLang}标题`, 'error')
      return
    }

    let transList = Object.entries(translations)
      .filter(([, t]) => t.title?.trim() || Object.keys(t.field_values || {}).length > 0)
      .map(([lang, t]) => ({
        language_code: lang,
        title: t.title,
        slug: t.slug || slugify(t.title, lang),
        is_published: publishAll ? true : t.is_published,
        field_values: t.field_values || {},
      }))

    if (transList.length === 0) {
      showToast('请至少填写一个语言版本的内容', 'error')
      return
    }

    try {
      setSaving(true)
      showToast('正在检查slug唯一性...', 'info')

      for (let i = 0; i < transList.length; i++) {
        const trans = transList[i]
        const uniqueSlug = await generateUniqueSlug(
          trans.title,
          trans.language_code,
          isEdit ? parseInt(entryId) : null
        )
        transList[i].slug = uniqueSlug
      }

      const payload = {
        content_type_id: contentType.id,
        status: publishAll ? 'published' : entryStatus,
        translations: transList,
      }

      if (isEdit) {
        await entriesApi.update(entryId, { status: publishAll ? 'published' : entryStatus })
        const existingTrans = await entriesApi.listTranslations(entryId)
        const existingLangs = new Set(existingTrans.data.map((t) => t.language_code))
        for (const trans of transList) {
          if (existingLangs.has(trans.language_code)) {
            await entriesApi.updateTranslation(entryId, trans.language_code, trans)
          } else {
            await entriesApi.createTranslation(entryId, trans)
          }
        }
        showToast('保存成功')
      } else {
        await entriesApi.create(payload)
        showToast('创建成功')
      }
      navigate(`/entries/${contentTypeSlug}`)
    } catch (e) {
      showToast('保存失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  const renderFieldInput = (field) => {
    const trans = getCurrentTrans()
    const value = trans.field_values?.[field.name] ?? ''
    const isLocked = !field.is_translatable && currentLang !== defaultLanguage

    const commonProps = {
      className: 'form-input',
      value,
      disabled: isLocked,
      onChange: (e) => handleFieldChange(field.name, e.target.value),
    }

    if (isLocked) {
      return (
        <div>
          <input {...commonProps} />
          <small style={{ color: '#6b7280' }}>此字段不支持翻译，请切换到{languageNames[defaultLanguage]}编辑</small>
        </div>
      )
    }

    switch (field.field_type) {
      case 'textarea':
      case 'richtext':
        return <textarea {...commonProps} className="form-textarea" rows={6} />
      case 'number':
        return <input {...commonProps} type="number" value={value === '' ? '' : Number(value)} />
      case 'boolean':
        return (
          <div className="form-check">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(field.name, e.target.checked)}
            />
            <label className="form-label" style={{ margin: 0 }}>启用</label>
          </div>
        )
      case 'date':
        return <input {...commonProps} type="date" />
      case 'select':
        return (
          <select className="form-select" value={value} onChange={(e) => handleFieldChange(field.name, e.target.value)}>
            <option value="">请选择</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      case 'json':
        return (
          <textarea
            className="form-textarea"
            rows={6}
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                handleFieldChange(field.name, parsed)
              } catch {
                handleFieldChange(field.name, e.target.value)
              }
            }}
          />
        )
      default:
        return <input {...commonProps} type="text" />
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

  const currentTrans = getCurrentTrans()
  const translatableFields = fields.filter((f) => f.is_translatable)
  const untranslatableFields = fields.filter((f) => !f.is_translatable)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isEdit ? '编辑条目' : '新建条目'} - {contentType?.name}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/entries/${contentTypeSlug}`} className="btn btn-secondary">返回列表</Link>
          <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? '保存中...' : '保存草稿'}
          </button>
          <button className="btn btn-success" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? '保存中...' : '保存并发布'}
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="lang-tabs">
            {languages.map((lang) => {
              ensureTranslationExists(lang)
              const t = translations[lang]
              const hasContent = t?.title?.trim() || Object.keys(t?.field_values || {}).some((k) => t.field_values[k])
              return (
                <button
                  key={lang}
                  className={`lang-tab ${currentLang === lang ? 'active' : ''}`}
                  onClick={() => setCurrentLang(lang)}
                >
                  <span className={`dot ${t?.is_published ? 'published' : ''}`}></span>
                  {languageNames[lang] || lang}
                  {hasContent && <span style={{ color: '#3b82f6', marginLeft: 4 }}>✓</span>}
                </button>
              )
            })}
          </div>

          <div>
            <h3 className="section-title">{languageNames[currentLang] || currentLang} 版本内容</h3>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  标题 {fields.find((f) => f.name === 'title')?.is_required && '*'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={currentTrans.title}
                  onChange={handleTitleChange}
                  placeholder="输入标题"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Slug (URL)</label>
                <input
                  type="text"
                  className="form-input"
                  value={currentTrans.slug}
                  onChange={handleSlugChange}
                  placeholder="留空将自动生成"
                />
              </div>
            </div>

            {fields.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>自定义字段</h4>
                {fields
                  .filter((f) => f.name !== 'title')
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((field) => (
                    <div key={field.id} className="form-group">
                      <label className="form-label">
                        {field.label}
                        {field.is_required && ' *'}
                        {!field.is_translatable && (
                          <span className="badge badge-info" style={{ marginLeft: 8 }}>不翻译</span>
                        )}
                        {field.description && (
                          <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                            ({field.description})
                          </span>
                        )}
                      </label>
                      {renderFieldInput(field)}
                    </div>
                  ))}
              </div>
            )}

            <div className="form-check" style={{ marginTop: 24 }}>
              <input
                type="checkbox"
                id="is_published"
                checked={currentTrans.is_published}
                onChange={handlePublishedChange}
              />
              <label htmlFor="is_published" className="form-label" style={{ margin: 0 }}>
                发布此语言版本
              </label>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
