import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { documentAPI } from '../api.js'

const EDITABLE_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml',
  'ini', 'cfg', 'conf', 'py', 'js', 'ts', 'html', 'css',
])

function isEditableFile(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return EDITABLE_EXTENSIONS.has(ext)
}

const typeLabels = {
  document: { text: 'DOC', className: 'type-document' },
  pdf: { text: 'PDF', className: 'type-pdf' },
  image: { text: 'IMG', className: 'type-image' },
  text: { text: 'TXT', className: 'type-text' },
}

const statusLabels = {
  uploaded: { text: '已上传', className: 'status-uploaded' },
  converting: { text: '转换中', className: 'status-converting' },
  ready: { text: '可预览', className: 'status-ready' },
  failed: { text: '转换失败', className: 'status-failed' },
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

export default function DocumentList() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [convertingId, setConvertingId] = useState(null)

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const res = await documentAPI.list()
      setDocuments(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || '加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleConvert = async (doc) => {
    setConvertingId(doc.id)
    try {
      await documentAPI.convert(doc.id, doc.watermark_enabled, doc.watermark_text)
      await fetchDocuments()
    } catch (err) {
      alert(err.response?.data?.detail || '转换失败')
    } finally {
      setConvertingId(null)
    }
  }

  const handleDelete = async (doc) => {
    if (!confirm(`确定要删除文档 "${doc.original_filename}" 吗？`)) return
    try {
      await documentAPI.delete(doc.id)
      await fetchDocuments()
    } catch (err) {
      alert(err.response?.data?.detail || '删除失败')
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="loading-spinner"></div>
          <p style={{ marginTop: 16, color: '#5f6368' }}>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="document-list-header" style={{ background: 'white', borderRadius: 8, marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0, padding: 16 }}>文档列表</h1>
        <div style={{ paddingRight: 24 }}>
          <Link to="/upload" className="btn btn-primary">+ 上传文档</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {documents.length === 0 ? (
        <div className="document-list">
          <div className="empty-state">
            <h3>暂无文档</h3>
            <p>点击上方按钮上传您的第一个文档</p>
          </div>
        </div>
      ) : (
        <div className="document-list">
          <table className="document-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>状态</th>
                <th>水印</th>
                <th>公开</th>
                <th>上传时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <span className={`file-type-icon ${typeLabels[doc.file_type]?.className}`}>
                      {typeLabels[doc.file_type]?.text || 'FILE'}
                    </span>
                    {doc.original_filename}
                  </td>
                  <td>{formatSize(doc.file_size)}</td>
                  <td>
                    <span className={`status-badge ${statusLabels[doc.status]?.className}`}>
                      {statusLabels[doc.status]?.text || doc.status}
                    </span>
                  </td>
                  <td>{doc.watermark_enabled ? '✓ ' + (doc.watermark_text || '默认') : '-'}</td>
                  <td>{doc.is_public ? '是' : '否'}</td>
                  <td>{formatDate(doc.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      {doc.status === 'ready' ? (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => navigate(`/preview/${doc.id}`)}
                          >
                            预览
                          </button>
                          {isEditableFile(doc.original_filename) && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/edit/${doc.id}`)}
                            >
                              编辑
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={convertingId === doc.id || doc.status === 'converting'}
                          onClick={() => handleConvert(doc)}
                        >
                          {convertingId === doc.id || doc.status === 'converting' ? '转换中...' : '转换'}
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(doc)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
