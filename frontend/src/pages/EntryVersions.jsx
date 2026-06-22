import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { entriesApi, publicApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

export default function EntryVersions() {
  const { contentTypeSlug, entryId } = useParams()
  const { showToast, languageNames, languages, defaultLanguage } = useApp()
  const [contentType, setContentType] = useState(null)
  const [entry, setEntry] = useState(null)
  const [versions, setVersions] = useState([])
  const [filterLang, setFilterLang] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewVersion, setPreviewVersion] = useState(null)
  const [showRollbackModal, setShowRollbackModal] = useState(false)
  const [rollbackTarget, setRollbackTarget] = useState(null)
  const [rollbackSummary, setRollbackSummary] = useState('')
  const [rollingBack, setRollingBack] = useState(false)
  const [draftPreviews, setDraftPreviews] = useState([])

  useEffect(() => {
    loadData()
  }, [contentTypeSlug, entryId, filterLang])

  const loadData = async () => {
    try {
      setLoading(true)
      const [ctRes, entryRes] = await Promise.all([
        publicApi.getContentType(contentTypeSlug),
        entriesApi.get(entryId),
      ])
      setContentType(ctRes.data)
      setEntry(entryRes.data)

      const versionParams = {}
      if (filterLang) versionParams.language_code = filterLang
      const versionsRes = await entriesApi.listVersions(entryId, versionParams)
      setVersions(versionsRes.data)

      const previewRes = await entriesApi.draftPreview(entryId, filterLang ? { language_code: filterLang } : {})
      setDraftPreviews(previewRes.data)
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = async () => {
    if (!rollbackTarget) return
    try {
      setRollingBack(true)
      await entriesApi.rollback(entryId, {
        version_number: rollbackTarget,
        change_summary: rollbackSummary || `回滚到版本 v${rollbackTarget}`,
      })
      showToast(`已成功回滚到版本 v${rollbackTarget}`)
      setShowRollbackModal(false)
      setRollbackTarget(null)
      setRollbackSummary('')
      loadData()
    } catch (e) {
      showToast('回滚失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setRollingBack(false)
    }
  }

  const openPreview = (version) => {
    setPreviewVersion(version)
  }

  const groupedVersions = {}
  versions.forEach((v) => {
    const key = `v${v.version_number}`
    if (!groupedVersions[key]) {
      groupedVersions[key] = { version_number: v.version_number, items: [] }
    }
    groupedVersions[key].items.push(v)
  })

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
          <h1 className="page-title">版本历史 - {contentType?.name}</h1>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            当前版本: <span style={{ fontWeight: 600, color: '#4f46e5' }}>v{entry?.current_version_number || 0}</span>
            {' | '}
            状态: {entry?.status === 'published' ? (
              <span className="badge badge-success">已发布</span>
            ) : (
              <span className="badge badge-warning">草稿</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/entries/${contentTypeSlug}`} className="btn btn-secondary">返回列表</Link>
          <Link to={`/entries/${contentTypeSlug}/${entryId}/edit`} className="btn btn-secondary">编辑条目</Link>
        </div>
      </div>

      {draftPreviews.length > 0 && draftPreviews.some((d) => d.has_unpublished_changes) && (
        <div className="page-body" style={{ paddingBottom: 0 }}>
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#92400e' }}>⚠️ 草稿预览（未发布更改）</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {draftPreviews.filter((d) => d.has_unpublished_changes).map((d) => (
                <div key={d.language_code} style={{ background: '#fff', borderRadius: 6, padding: 10, border: '1px solid #e5e7eb', minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    {languageNames[d.language_code] || d.language_code}
                    <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: 10 }}>草稿</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151' }}>
                    <div>标题: {d.draft_title || '(空)'}</div>
                    <div>Slug: {d.draft_slug || '(空)'}</div>
                  </div>
                  {d.published_version && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280' }}>
                      已发布: v{d.published_version.version_number} - {d.published_version.title || '(空)'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="page-body">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>版本记录</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: '#6b7280' }}>筛选语言:</label>
              <select
                className="form-select"
                style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
                value={filterLang}
                onChange={(e) => setFilterLang(e.target.value)}
              >
                <option value="">全部语言</option>
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{languageNames[lang] || lang}</option>
                ))}
              </select>
            </div>
          </div>

          {Object.keys(groupedVersions).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">暂无版本记录</div>
              <p>发布内容后将自动生成版本记录</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(groupedVersions)
                .sort(([, a], [, b]) => b.version_number - a.version_number)
                .map(([key, group]) => {
                  const isCurrent = group.version_number === entry?.current_version_number
                  return (
                    <div
                      key={key}
                      style={{
                        border: `1px solid ${isCurrent ? '#6366f1' : '#e5e7eb'}`,
                        borderRadius: 8,
                        padding: 16,
                        background: isCurrent ? '#eef2ff' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 16, color: isCurrent ? '#4f46e5' : '#374151' }}>
                            v{group.version_number}
                          </span>
                          {isCurrent && <span className="badge badge-success">当前版本</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {!isCurrent && (
                            <button
                              className="btn btn-sm btn-warning"
                              onClick={() => {
                                setRollbackTarget(group.version_number)
                                setShowRollbackModal(true)
                              }}
                            >
                              ↩ 回滚到此版本
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {group.items.map((v) => (
                          <div
                            key={v.id}
                            style={{
                              flex: '1 1 250px',
                              background: '#f9fafb',
                              borderRadius: 6,
                              padding: 10,
                              border: '1px solid #e5e7eb',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                {languageNames[v.language_code] || v.language_code}
                              </span>
                              <span className={`badge ${v.is_published ? 'badge-success' : 'badge-warning'}`}>
                                {v.is_published ? '已发布' : '草稿'}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#4b5563' }}>
                              <div>标题: {v.title || '(空)'}</div>
                              <div>Slug: {v.slug || '(空)'}</div>
                            </div>
                            {v.change_summary && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                                📝 {v.change_summary}
                              </div>
                            )}
                            <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                              {new Date(v.created_at).toLocaleString('zh-CN')}
                            </div>
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }}
                              onClick={() => openPreview(v)}
                            >
                              预览
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {previewVersion && (
        <div className="modal-backdrop" onClick={() => setPreviewVersion(null)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                版本预览 - v{previewVersion.version_number} ({languageNames[previewVersion.language_code] || previewVersion.language_code})
              </h3>
              <button className="modal-close" onClick={() => setPreviewVersion(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">标题</label>
                <input className="form-input" value={previewVersion.title || ''} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Slug</label>
                <input className="form-input" value={previewVersion.slug || ''} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">字段内容</label>
                <textarea
                  className="form-textarea"
                  rows={10}
                  value={JSON.stringify(previewVersion.field_values || {}, null, 2)}
                  disabled
                  style={{ background: '#f9fafb' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                <span>状态: {previewVersion.is_published ? '已发布' : '草稿'}</span>
                <span>创建时间: {new Date(previewVersion.created_at).toLocaleString('zh-CN')}</span>
                {previewVersion.created_by && <span>创建者: {previewVersion.created_by}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewVersion(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showRollbackModal && (
        <div className="modal-backdrop" onClick={() => setShowRollbackModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">确认回滚</h3>
              <button className="modal-close" onClick={() => setShowRollbackModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#374151', marginBottom: 16 }}>
                确定要回滚到版本 <strong>v{rollbackTarget}</strong> 吗？
              </p>
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
                回滚将创建一个新版本 (v{(entry?.current_version_number || 0) + 1})，其内容与 v{rollbackTarget} 相同。
                当前线上版本不会被删除，仍可在版本历史中查看。
              </p>
              <div className="form-group">
                <label className="form-label">回滚说明（可选）</label>
                <input
                  type="text"
                  className="form-input"
                  value={rollbackSummary}
                  onChange={(e) => setRollbackSummary(e.target.value)}
                  placeholder="例如：回滚因错误发布的内容"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRollbackModal(false)}>取消</button>
              <button className="btn btn-warning" onClick={handleRollback} disabled={rollingBack}>
                {rollingBack ? '回滚中...' : '确认回滚'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
