import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentAPI } from '../api.js'

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

export default function DocumentPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [previewInfo, setPreviewInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [previewKey, setPreviewKey] = useState(0)

  const token = localStorage.getItem('token')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [docRes, infoRes] = await Promise.all([
        documentAPI.get(id),
        documentAPI.getPreviewInfo(id),
      ])
      setDoc(docRes.data)
      setPreviewInfo(infoRes.data)
    } catch (err) {
      setError(err.response?.data?.detail || '加载文档失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleConvert = async () => {
    try {
      setLoading(true)
      await documentAPI.convert(id, doc.watermark_enabled, doc.watermark_text)
      setPreviewKey((k) => k + 1)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || '转换失败')
    } finally {
      setLoading(false)
    }
  }

  const buildPreviewUrl = (page) => {
    let url = `/api/documents/${id}/preview`
    if (page) url += `?page=${page}`
    return url
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

  if (error) {
    return (
      <div className="page-container">
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
          返回文档列表
        </button>
      </div>
    )
  }

  if (!doc) return null

  const totalPages = previewInfo?.total_pages || 0

  return (
    <div className="page-container">
      <div className="preview-container">
        <div className="preview-header">
          <h2>📄 {doc.original_filename}</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            {doc.status !== 'ready' && (
              <button className="btn btn-primary btn-sm" onClick={handleConvert}>
                重新转换
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/documents')}>
              返回列表
            </button>
          </div>
        </div>

        <div className="document-info">
          <div className="info-item">
            <label>文件类型</label>
            <span>{doc.file_type?.toUpperCase()}</span>
          </div>
          <div className="info-item">
            <label>文件大小</label>
            <span>{formatSize(doc.file_size)}</span>
          </div>
          <div className="info-item">
            <label>预览格式</label>
            <span>{doc.preview_type || '-'}</span>
          </div>
          <div className="info-item">
            <label>水印</label>
            <span>{doc.watermark_enabled ? '✓ ' + (doc.watermark_text || '默认') : '未启用'}</span>
          </div>
          <div className="info-item">
            <label>公开访问</label>
            <span>{doc.is_public ? '是' : '否'}</span>
          </div>
          <div className="info-item">
            <label>上传时间</label>
            <span>{formatDate(doc.created_at)}</span>
          </div>
        </div>

        {doc.status !== 'ready' ? (
          <div className="preview-content">
            <div style={{ textAlign: 'center', padding: 40 }}>
              <h3 style={{ color: '#5f6368', marginBottom: 16 }}>
                文档尚未转换为预览格式
              </h3>
              <button className="btn btn-primary" onClick={handleConvert}>
                立即转换
              </button>
            </div>
          </div>
        ) : doc.preview_type === 'html' ? (
          <div className="preview-content">
            <iframe
              key={previewKey}
              src={buildPreviewUrl() + '?_t=' + Date.now()}
              title={doc.original_filename}
              onError={() => setError('预览加载失败')}
            />
          </div>
        ) : doc.preview_type === 'image' ? (
          <div className="preview-content">
            <img
              key={previewKey}
              src={buildPreviewUrl() + '&_t=' + Date.now()}
              alt={doc.original_filename}
            />
          </div>
        ) : doc.preview_type === 'pdf_images' ? (
          <>
            <div className="preview-content">
              <img
                key={previewKey + '-' + currentPage}
                src={buildPreviewUrl(currentPage) + '&_t=' + Date.now()}
                alt={`${doc.original_filename} - 第 ${currentPage} 页`}
              />
            </div>
            {totalPages > 1 && (
              <div className="pdf-pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  上一页
                </button>
                <span>
                  第 <strong>{currentPage}</strong> / {totalPages} 页
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="preview-content">
            <div style={{ textAlign: 'center', color: '#5f6368' }}>
              未知的预览格式
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
