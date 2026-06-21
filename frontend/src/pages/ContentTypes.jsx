import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { contentTypesApi } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

export default function ContentTypes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await contentTypesApi.list()
      setItems(res.data)
    } catch (e) {
      showToast('加载失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`确定要删除内容类型「${name}」吗？这会同时删除所有相关字段和条目。`)) return
    try {
      await contentTypesApi.delete(id)
      showToast('删除成功')
      loadData()
    } catch (e) {
      showToast('删除失败: ' + (e.response?.data?.detail || e.message), 'error')
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">内容类型</h1>
        <Link to="/content-types/new" className="btn btn-primary">
          + 新建内容类型
        </Link>
      </div>
      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="empty-state">加载中...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">暂无内容类型</div>
              <p>创建自定义内容类型来管理您的数据</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>Slug</th>
                  <th>描述</th>
                  <th>字段数</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td><strong>{item.name}</strong></td>
                    <td><code>{item.slug}</code></td>
                    <td>{item.description || '-'}</td>
                    <td>{item.fields.length}</td>
                    <td>
                      {item.is_active ? (
                        <span className="badge badge-success">启用</span>
                      ) : (
                        <span className="badge badge-warning">停用</span>
                      )}
                    </td>
                    <td>{new Date(item.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <div className="action-buttons">
                        <Link to={`/entries/${item.slug}`} className="btn btn-sm btn-secondary">
                          条目
                        </Link>
                        <Link to={`/content-types/${item.id}/fields`} className="btn btn-sm btn-primary">
                          字段
                        </Link>
                        <Link to={`/content-types/${item.id}/edit`} className="btn btn-sm btn-secondary">
                          编辑
                        </Link>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(item.id, item.name)}
                        >
                          删除
                        </button>
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
