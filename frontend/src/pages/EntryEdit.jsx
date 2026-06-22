import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { publicApi, entriesApi, translationApi, LANGUAGES, TASK_PRIORITY } from '../services/api.js'
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
  const { languages, defaultLanguage, languageNames, showToast, hasPermission } = useApp()
  const isEdit = !!entryId

  const [contentType, setContentType] = useState(null)
  const [fields, setFields] = useState([])
  const [currentLang, setCurrentLang] = useState(defaultLanguage)
  const [translations, setTranslations] = useState({})
  const [entryStatus, setEntryStatus] = useState('draft')
  const [currentVersionNumber, setCurrentVersionNumber] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')
  const [translateForm, setTranslateForm] = useState({
    source_language: defaultLanguage,
    target_languages: [],
    priority: 'medium',
    description: '',
  })
  const [creatingTask, setCreatingTask] = useState(false)

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
        setCurrentVersionNumber(entry.current_version_number || 0)
        const transMap = {}
        entry.translations.forEach((t) => {
          const pubVer = t.published_version
          transMap[t.language_code] = {
            draft_title: t.draft_title || '',
            draft_slug: t.draft_slug || '',
            slug_edited: !!t.draft_slug,
            is_published: t.is_published,
            draft_field_values: { ...(t.draft_field_values || {}) },
            published_version: pubVer || null,
            has_unpublished_changes: pubVer
              ? (t.draft_title !== pubVer.title || t.draft_slug !== pubVer.slug ||
                JSON.stringify(t.draft_field_values || {}) !== JSON.stringify(pubVer.field_values || {}))
              : !!t.draft_title,
          }
        })
        setTranslations(transMap)
      } else {
        const initial = {}
        languages.forEach((lang) => {
          initial[lang] = {
            draft_title: '',
            draft_slug: '',
            slug_edited: false,
            is_published: false,
            draft_field_values: {},
            published_version: null,
            has_unpublished_changes: false,
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

  const getCurrentTrans = () => translations[currentLang] || { draft_title: '', draft_slug: '', slug_edited: false, draft_field_values: {}, is_published: false }

  const updateCurrentTrans = (updater) => {
    setTranslations((prev) => {
      const next = { ...prev }
      const curr = next[currentLang] || { draft_title: '', draft_slug: '', slug_edited: false, draft_field_values: {}, is_published: false }
      next[currentLang] = typeof updater === 'function' ? updater(curr) : { ...curr, ...updater }
      return next
    })
  }

  const handleFieldChange = (fieldName, value) => {
    updateCurrentTrans((curr) => ({
      ...curr,
      draft_field_values: { ...curr.draft_field_values, [fieldName]: value },
    }))
  }

  const handleTitleChange = (e) => {
    const title = e.target.value
    updateCurrentTrans((curr) => {
      const newSlug = !curr.slug_edited && curr.draft_slug === '' ? slugify(title, currentLang) : curr.draft_slug
      return {
        ...curr,
        draft_title: title,
        draft_slug: newSlug,
        draft_field_values: { ...curr.draft_field_values, title },
      }
    })
  }

  const handleSlugChange = (e) => {
    updateCurrentTrans({ draft_slug: e.target.value, slug_edited: true })
  }

  const handlePublishedChange = (e) => {
    updateCurrentTrans({ is_published: e.target.checked })
  }

  const ensureTranslationExists = (lang) => {
    if (!translations[lang]) {
      setTranslations((prev) => ({
        ...prev,
        [lang]: { draft_title: '', draft_slug: '', slug_edited: false, draft_field_values: {}, is_published: false, published_version: null, has_unpublished_changes: false },
      }))
    }
  }

  const handleSave = async (publishAll = false) => {
    const current = getCurrentTrans()
    if (!current.draft_title?.trim()) {
      showToast(`请先填写${languageNames[currentLang] || currentLang}标题`, 'error')
      return
    }

    let transList = Object.entries(translations)
      .filter(([, t]) => t.draft_title?.trim() || Object.keys(t.draft_field_values || {}).length > 0)
      .map(([lang, t]) => ({
        language_code: lang,
        draft_title: t.draft_title,
        draft_slug: t.draft_slug,
        slug_edited: !!t.slug_edited,
        is_published: publishAll ? true : t.is_published,
        draft_field_values: t.draft_field_values || {},
      }))

    if (transList.length === 0) {
      showToast('请至少填写一个语言版本的内容', 'error')
      return
    }

    try {
      setSaving(true)

      for (let i = 0; i < transList.length; i++) {
        const trans = transList[i]
        if (!trans.slug_edited) {
          showToast(`正在为${languageNames[trans.language_code] || trans.language_code}版本生成唯一slug...`, 'info')
          const uniqueSlug = await generateUniqueSlug(
            trans.draft_title,
            trans.language_code,
            isEdit ? parseInt(entryId) : null
          )
          transList[i].draft_slug = uniqueSlug
        } else {
          if (!trans.draft_slug?.trim()) {
            showToast(`${languageNames[trans.language_code] || trans.language_code}版本slug不能为空`, 'error')
            setSaving(false)
            return
          }
          const res = await entriesApi.checkSlug(trans.draft_slug, isEdit ? parseInt(entryId) : null)
          if (!res.data.available) {
            showToast(`${languageNames[trans.language_code] || trans.language_code}版本slug "${trans.draft_slug}" 已被占用，请修改`, 'error')
            setSaving(false)
            return
          }
        }
        delete transList[i].slug_edited
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
        if (publishAll) {
          await entriesApi.publish(entryId, { change_summary: changeSummary || undefined })
        }
        showToast('保存成功')
      } else {
        const payload = {
          content_type_id: contentType.id,
          status: publishAll ? 'published' : 'draft',
          translations: transList,
        }
        const createRes = await entriesApi.create(payload)
        if (publishAll && createRes.data.id) {
          await entriesApi.publish(createRes.data.id, { change_summary: changeSummary || undefined })
        }
        showToast('创建成功')
      }
      navigate(`/entries/${contentTypeSlug}`)
    } catch (e) {
      showToast('保存失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    try {
      setSaving(true)
      await entriesApi.publish(entryId, { change_summary: changeSummary || undefined })
      showToast('发布成功，已生成新版本')
      setShowPublishModal(false)
      setChangeSummary('')
      loadData()
    } catch (e) {
      showToast('发布失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  const openTranslateModal = () => {
    setTranslateForm({
      source_language: currentLang,
      target_languages: languages.filter((l) => l !== currentLang),
      priority: 'medium',
      description: '',
    })
    setShowTranslateModal(true)
  }

  const handleCreateTranslationTask = async () => {
    if (translateForm.target_languages.length === 0) {
      showToast('请至少选择一个目标语言', 'error')
      return
    }
    try {
      setCreatingTask(true)
      await translationApi.create({
        entry_id: parseInt(entryId),
        source_language: translateForm.source_language,
        target_languages: translateForm.target_languages,
        priority: translateForm.priority,
        description: translateForm.description,
      })
      showToast('翻译任务创建成功')
      setShowTranslateModal(false)
    } catch (e) {
      showToast('创建失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setCreatingTask(false)
    }
  }

  const renderFieldInput = (field) => {
    const trans = getCurrentTrans()
    const value = trans.draft_field_values?.[field.name] ?? ''
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
          {isEdit && currentVersionNumber > 0 && (
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
              当前版本: v{currentVersionNumber}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/entries/${contentTypeSlug}`} className="btn btn-secondary">返回列表</Link>
          {isEdit && hasPermission('create_translation') && (
            <button className="btn btn-primary" onClick={openTranslateModal} disabled={saving}>
              🌐 发起翻译任务
            </button>
          )}
          <Link to={`/entries/${contentTypeSlug}/${entryId}/versions`} className="btn btn-secondary" style={{ display: isEdit ? '' : 'none' }}>
            📋 版本历史
          </Link>
          <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? '保存中...' : '保存草稿'}
          </button>
          {isEdit ? (
            <button className="btn btn-success" onClick={() => setShowPublishModal(true)} disabled={saving}>
              {saving ? '发布中...' : '发布新版本'}
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? '保存中...' : '保存并发布'}
            </button>
          )}
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="lang-tabs">
            {languages.map((lang) => {
              ensureTranslationExists(lang)
              const t = translations[lang]
              const hasContent = t?.draft_title?.trim() || Object.keys(t?.draft_field_values || {}).some((k) => t.draft_field_values[k])
              const hasUnpublished = t?.has_unpublished_changes
              return (
                <button
                  key={lang}
                  className={`lang-tab ${currentLang === lang ? 'active' : ''}`}
                  onClick={() => setCurrentLang(lang)}
                >
                  <span className={`dot ${t?.is_published ? 'published' : ''}`}></span>
                  {languageNames[lang] || lang}
                  {hasContent && <span style={{ color: '#3b82f6', marginLeft: 4 }}>✓</span>}
                  {hasUnpublished && <span style={{ color: '#f59e0b', marginLeft: 2, fontSize: 10 }}>●</span>}
                </button>
              )
            })}
          </div>

          <div>
            <h3 className="section-title">{languageNames[currentLang] || currentLang} 版本内容</h3>

            {currentTrans.has_unpublished_changes && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                ⚠️ 当前草稿与已发布版本有差异，保存草稿不会影响线上内容。点击"发布新版本"可将草稿发布为新版本。
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  标题 {fields.find((f) => f.name === 'title')?.is_required && '*'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={currentTrans.draft_title}
                  onChange={handleTitleChange}
                  placeholder="输入标题"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Slug (URL)</label>
                <input
                  type="text"
                  className="form-input"
                  value={currentTrans.draft_slug}
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

      {showPublishModal && (
        <div className="modal-backdrop" onClick={() => setShowPublishModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">发布新版本</h3>
              <button className="modal-close" onClick={() => setShowPublishModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
                发布后，当前草稿内容将生成为新版本 (v{currentVersionNumber + 1})，线上已发布的旧版本仍保留。
              </p>
              <div className="form-group">
                <label className="form-label">版本说明（可选）</label>
                <input
                  type="text"
                  className="form-input"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="例如：更新产品价格、修复错别字等"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPublishModal(false)}>取消</button>
              <button className="btn btn-success" onClick={handlePublish} disabled={saving}>
                {saving ? '发布中...' : '确认发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTranslateModal && (
        <div className="modal-backdrop" onClick={() => setShowTranslateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">发起翻译任务</h3>
              <button className="modal-close" onClick={() => setShowTranslateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">源语言</label>
                <select
                  className="form-select"
                  value={translateForm.source_language}
                  onChange={(e) => setTranslateForm({ ...translateForm, source_language: e.target.value })}
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>{languageNames[lang] || lang}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">目标语言（可多选）</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {languages.filter((l) => l !== translateForm.source_language).map((lang) => (
                    <label key={lang} className="form-check" style={{ margin: 0, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                      <input
                        type="checkbox"
                        checked={translateForm.target_languages.includes(lang)}
                        onChange={(e) => {
                          const next = new Set(translateForm.target_languages)
                          if (e.target.checked) next.add(lang)
                          else next.delete(lang)
                          setTranslateForm({ ...translateForm, target_languages: Array.from(next) })
                        }}
                      />
                      <span style={{ margin: 0 }}>{languageNames[lang] || lang}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">优先级</label>
                <select
                  className="form-select"
                  value={translateForm.priority}
                  onChange={(e) => setTranslateForm({ ...translateForm, priority: e.target.value })}
                >
                  {Object.entries(TASK_PRIORITY).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">翻译说明</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={translateForm.description}
                  onChange={(e) => setTranslateForm({ ...translateForm, description: e.target.value })}
                  placeholder="可选，为翻译人员提供上下文说明"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTranslateModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateTranslationTask} disabled={creatingTask}>
                {creatingTask ? '创建中...' : '创建翻译任务'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
