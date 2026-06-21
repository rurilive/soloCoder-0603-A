import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { contentTypesApi, entriesApi } from '../services/api.js'

export default function Dashboard() {
  const [stats, setStats] = useState({ contentTypes: 0, entries: 0, published: 0, languages: 0 })
  const [contentTypes, setContentTypes] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ctRes, entriesRes] = await Promise.all([
        contentTypesApi.list(),
        entriesApi.list({ limit: 1000 }),
      ])
      setContentTypes(ctRes.data)
      const publishedCount = entriesRes.data.filter(
        (e) => e.status === 'published' && e.translations.some((t) => t.is_published)
      ).length
      const langSet = new Set()
      entriesRes.data.forEach((e) => e.translations.forEach((t) => langSet.add(t.language_code)))
      setStats({
        contentTypes: ctRes.data.length,
        entries: entriesRes.data.length,
        published: publishedCount,
        languages: langSet.size,
      })
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">仪表盘</h1>
      </div>
      <div className="page-body">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.contentTypes}</div>
            <div className="stat-label">内容类型</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.entries}</div>
            <div className="stat-label">内容条目</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.published}</div>
            <div className="stat-label">已发布条目</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.languages}</div>
            <div className="stat-label">使用中的语言</div>
          </div>
        </div>

        <div className="card">
          <h3 className="section-title">内容类型</h3>
          {contentTypes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">暂无内容类型</div>
              <p>点击下方按钮创建第一个内容类型</p>
              <div style={{ marginTop: 16 }}>
                <Link to="/content-types/new" className="btn btn-primary">
                  + 创建内容类型
                </Link>
              </div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Slug</th>
                  <th>描述</th>
                  <th>状态</th>
                  <th>字段数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {contentTypes.map((ct) => (
                  <tr key={ct.id}>
                    <td><strong>{ct.name}</strong></td>
                    <td><code>{ct.slug}</code></td>
                    <td>{ct.description || '-'}</td>
                    <td>
                      {ct.is_active ? (
                        <span className="badge badge-success">启用</span>
                      ) : (
                        <span className="badge badge-warning">停用</span>
                      )}
                    </td>
                    <td>{ct.fields.length}</td>
                    <td>
                      <div className="action-buttons">
                        <Link to={`/entries/${ct.slug}`} className="btn btn-sm btn-secondary">
                          管理条目
                        </Link>
                        <Link to={`/content-types/${ct.id}/fields`} className="btn btn-sm btn-primary">
                          配置字段
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
