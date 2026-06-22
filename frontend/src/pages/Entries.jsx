import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { publicApi, entriesApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

export default function Entries() {
  const { contentTypeSlug } = useParams()
  const { showToast, defaultLanguage } = useApp()
  const [contentType, setContentType] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [contentTypeSlug])

  const loadData = async () => {
    try {
      setLoading(true)
      const [ctRes, entriesRes] = await Promise.all([
        publicApi.getContentType(contentTypeSlug),
        entriesApi.list({ content_type_slug: contentTypeSlug, limit: 1000 }),
      ])
      setContentType(ctRes.data)
      setEntries(entriesRes.data)
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (entry, title) => {
    if (!window.confirm(`确定删除条目「${title || '#' + entry.id}」吗？`)) return
    try {
      await entriesApi.delete(entry.id)
      showToast('删除成功')
      loadData()
    } catch (e) {
      showToast('删除失败: ' + (e.response?.data?.detail || e.message), 'error')
    }
  }

  const handlePublish = async (entry) => {
    try {
      await entriesApi.publish(entry.id, {})
      showToast('已发布新版本')
      loadData()
    } catch (e) {
      showToast('操作失败: ' + (e.response?.data?.detail || e.message), 'error')
    }
  }

  const handleUnpublish = async (entry) => {
    try {
      await entriesApi.unpublish(entry.id)
      showToast('已取消发布')
      loadData()
    } catch (e) {
      showToast('操作失败: ' + (e.response?.data?.detail || e.message), 'error')
    }
  }

  const getDefaultTitle = (entry) => {
    const defaultTrans = entry.translations.find((t) => t.language_code === defaultLanguage)
    if (defaultTrans) return defaultTrans.draft_title || defaultTrans.published_version?.title
    if (entry.translations.length > 0) {
      return entry.translations[0].draft_title || entry.translations[0].published_version?.title
    }
    return null
  }

  const hasUnpublishedChanges = (entry) => {
    return entry.has_unpublished_changes
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
          <h1 className="page-title">内容条目 - {contentType?.name}</h1>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Slug: <code>{contentType?.slug}</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/content-types/${contentType?.id}/fields`} className="btn btn-secondary">配置字段</Link>
          <Link to="/content-types" className="btn btn-secondary">内容类型</Link>
          <Link to={`/entries/${contentTypeSlug}/new`} className="btn btn-primary">+ 新建条目</Link>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">暂无条目</div>
              <p>点击"新建条目"按钮创建第一条内容</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>翻译版本</th>
                  <th>状态</th>
                  <th>版本</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const title = getDefaultTitle(entry)
                  const unpublished = hasUnpublishedChanges(entry)
                  return (
                    <tr key={entry.id}>
                      <td>#{entry.id}</td>
                      <td>
                        <Link to={`/entries/${contentTypeSlug}/${entry.id}/edit`} style={{ color: '#1f2937', fontWeight: 500, textDecoration: 'none' }}>
                          {title || '(未命名)'}
                        </Link>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {entry.translations.map((t) => (
                            <span
                              key={t.language_code}
                              className={`badge ${t.is_published ? 'badge-success' : 'badge-warning'}`}
                              title={t.language_code}
                            >
                              {t.language_code.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {entry.status === 'published' ? (
                            <span className="badge badge-success">已发布</span>
                          ) : (
                            <span className="badge badge-warning">草稿</span>
                          )}
                          {unpublished && (
                            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: 11 }}>
                              有未发布更改
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#4f46e5' }}>v{entry.current_version_number || 0}</span>
                      </td>
                      <td>{new Date(entry.updated_at).toLocaleString('zh-CN')}</td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/entries/${contentTypeSlug}/${entry.id}/edit`} className="btn btn-sm btn-secondary">
                            编辑
                          </Link>
                          <Link to={`/entries/${contentTypeSlug}/${entry.id}/versions`} className="btn btn-sm btn-secondary">
                            版本
                          </Link>
                          {entry.status === 'published' ? (
                            <button className="btn btn-sm btn-warning" onClick={() => handleUnpublish(entry)}>
                              取消发布
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-success" onClick={() => handlePublish(entry)}>
                              发布
                            </button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(entry, title)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
