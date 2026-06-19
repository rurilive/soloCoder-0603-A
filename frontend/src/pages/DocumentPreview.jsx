import React, { useState, useEffect, useCallback, useRef } from 'react'
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

function getCurrentUser() {
  try {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

const COLOR_OPTIONS = [
  '#fef3c7',
  '#dbeafe',
  '#dcfce7',
  '#fce7f3',
  '#ede9fe',
  '#fee2e2',
]

function AnnotationForm({ onSubmit, onCancel, initialContent = '', initialColor = '#fef3c7' }) {
  const [content, setContent] = useState(initialContent)
  const [color, setColor] = useState(initialColor)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!content.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(content.trim(), color)
      setContent('')
      setColor('#fef3c7')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="annotation-form" onSubmit={handleSubmit}>
      <textarea
        className="annotation-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入注释内容..."
        rows={3}
      />
      <div className="annotation-form-footer">
        <div className="color-picker">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-dot ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
        <div className="annotation-actions">
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!content.trim() || submitting}
          >
            {submitting ? '提交中...' : '保存'}
          </button>
        </div>
      </div>
    </form>
  )
}

function ReplyForm({ onSubmit, onCancel }) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!content.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(content.trim())
      setContent('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="reply-form" onSubmit={handleSubmit}>
      <textarea
        className="annotation-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="回复..."
        rows={2}
      />
      <div className="annotation-form-footer">
        <div></div>
        <div className="annotation-actions">
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!content.trim() || submitting}
          >
            {submitting ? '回复中...' : '回复'}
          </button>
        </div>
      </div>
    </form>
  )
}

function ReplyItem({ reply, currentUserId, docId, annId, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(reply.content)
  const [loading, setLoading] = useState(false)

  const isAuthor = currentUserId === reply.author.id

  const handleSave = async () => {
    if (!editContent.trim()) return
    setLoading(true)
    try {
      await documentAPI.updateReply(docId, annId, reply.id, { content: editContent.trim() })
      onUpdate(reply.id, { ...reply, content: editContent.trim() })
      setEditing(false)
    } catch (err) {
      alert(err.response?.data?.detail || '更新失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定删除此回复？')) return
    setLoading(true)
    try {
      await documentAPI.deleteReply(docId, annId, reply.id)
      onDelete(reply.id)
    } catch (err) {
      alert(err.response?.data?.detail || '删除失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="reply-item">
      <div className="reply-header">
        <span className="reply-author">{reply.author.full_name || reply.author.username}</span>
        <span className="reply-time">{formatDate(reply.created_at)}</span>
      </div>
      {editing ? (
        <div>
          <textarea
            className="annotation-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={2}
          />
          <div className="annotation-form-footer">
            <div></div>
            <div className="annotation-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditing(false)
                  setEditContent(reply.content)
                }}
                disabled={loading}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={!editContent.trim() || loading}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="reply-content">{reply.content}</div>
          {isAuthor && (
            <div className="reply-actions">
              <button
                type="button"
                className="link-btn"
                onClick={() => setEditing(true)}
              >
                编辑
              </button>
              <button
                type="button"
                className="link-btn link-danger"
                onClick={handleDelete}
              >
                删除
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AnnotationItem({ annotation, docId, currentUserId, onUpdate, onDelete, onAddReply }) {
  const [showReplies, setShowReplies] = useState(true)
  const [replyFormOpen, setReplyFormOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const isAuthor = currentUserId === annotation.author.id
  const replies = annotation.replies || []

  const handleUpdate = (fields) => {
    setLoading(true)
    documentAPI.updateAnnotation(docId, annotation.id, fields)
      .then((res) => {
        onUpdate(res.data)
      })
      .catch((err) => {
        alert(err.response?.data?.detail || '更新失败')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleDelete = () => {
    if (!confirm('确定删除此注释？相关回复将一并删除。')) return
    setLoading(true)
    documentAPI.deleteAnnotation(docId, annotation.id)
      .then(() => {
        onDelete(annotation.id)
      })
      .catch((err) => {
        alert(err.response?.data?.detail || '删除失败')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleToggleResolve = () => {
    handleUpdate({ is_resolved: !annotation.is_resolved })
  }

  const handleEdit = (content, color) => {
    handleUpdate({ content, color })
    setEditing(false)
    return Promise.resolve()
  }

  const handleAddReply = async (content) => {
    const res = await documentAPI.createReply(docId, annotation.id, { content })
    onAddReply(annotation.id, res.data)
    setReplyFormOpen(false)
  }

  const handleUpdateReply = (replyId, updatedReply) => {
    const newReplies = replies.map((r) => (r.id === replyId ? updatedReply : r))
    onUpdate({ ...annotation, replies: newReplies })
  }

  const handleDeleteReply = (replyId) => {
    const newReplies = replies.filter((r) => r.id !== replyId)
    onUpdate({ ...annotation, replies: newReplies })
  }

  return (
    <div
      className={`annotation-card ${annotation.is_resolved ? 'resolved' : ''}`}
      style={{ borderLeftColor: annotation.color }}
    >
      <div
        className="annotation-marker"
        style={{ background: annotation.color }}
        title={`第 ${annotation.page} 页`}
      >
        P{annotation.page}
      </div>
      <div className="annotation-body">
        <div className="annotation-header">
          <div className="annotation-author-info">
            <span className="annotation-author">
              {annotation.author.full_name || annotation.author.username}
            </span>
            <span className="annotation-time">
              {formatDate(annotation.created_at)}
            </span>
            {annotation.page > 0 && (
              <span className="annotation-page-tag">第 {annotation.page} 页</span>
            )}
          </div>
          <div className="annotation-tools">
            <button
              type="button"
              className={`link-btn ${annotation.is_resolved ? 'resolved-badge' : ''}`}
              onClick={handleToggleResolve}
              disabled={loading}
              title={annotation.is_resolved ? '标记为未解决' : '标记为已解决'}
            >
              {annotation.is_resolved ? '✓ 已解决' : '解决'}
            </button>
          </div>
        </div>
        {annotation.selected_text && (
          <div className="annotation-selected-text">"{annotation.selected_text}"</div>
        )}
        {editing ? (
          <AnnotationForm
            onSubmit={handleEdit}
            onCancel={() => setEditing(false)}
            initialContent={annotation.content}
            initialColor={annotation.color}
          />
        ) : (
          <div className="annotation-content">{annotation.content}</div>
        )}
        {!editing && isAuthor && (
          <div className="annotation-actions-row">
            <button
              type="button"
              className="link-btn"
              onClick={() => setEditing(true)}
            >
              编辑
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => setReplyFormOpen((v) => !v)}
            >
              {replyFormOpen ? '取消回复' : `回复 ${replies.length > 0 ? `(${replies.length})` : ''}`}
            </button>
            <button
              type="button"
              className="link-btn link-danger"
              onClick={handleDelete}
              disabled={loading}
            >
              删除
            </button>
          </div>
        )}
        {!editing && !isAuthor && (
          <div className="annotation-actions-row">
            <button
              type="button"
              className="link-btn"
              onClick={() => setReplyFormOpen((v) => !v)}
            >
              {replyFormOpen ? '取消回复' : `回复 ${replies.length > 0 ? `(${replies.length})` : ''}`}
            </button>
          </div>
        )}
        {replyFormOpen && !editing && (
          <ReplyForm onSubmit={handleAddReply} onCancel={() => setReplyFormOpen(false)} />
        )}
        {replies.length > 0 && (
          <div className="replies-section">
            <div
              className="replies-toggle"
              onClick={() => setShowReplies((v) => !v)}
            >
              {showReplies ? '▼' : '▶'} {replies.length} 条回复
            </div>
            {showReplies && (
              <div className="replies-list">
                {replies.map((r) => (
                  <ReplyItem
                    key={r.id}
                    reply={r}
                    currentUserId={currentUserId}
                    docId={docId}
                    annId={annotation.id}
                    onUpdate={handleUpdateReply}
                    onDelete={handleDeleteReply}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
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

  const [annotations, setAnnotations] = useState([])
  const [annotationsLoading, setAnnotationsLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const wsRef = useRef(null)

  const currentUser = getCurrentUser()
  const currentUserId = currentUser?.id

  const token = localStorage.getItem('token')

  const fetchAnnotations = useCallback(async () => {
    try {
      setAnnotationsLoading(true)
      const res = await documentAPI.listAnnotations(id)
      setAnnotations(res.data)
    } catch (err) {
      console.error('加载注释失败:', err)
    } finally {
      setAnnotationsLoading(false)
    }
  }, [id])

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
    fetchAnnotations()
  }, [fetchData, fetchAnnotations])

  useEffect(() => {
    if (!id || !token) return

    let reconnectTimer = null
    let heartbeatTimer = null

    const connectWs = () => {
      try {
        const wsUrl = documentAPI.getAnnotationsWsUrl(id)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        setWsStatus('connecting')

        ws.onopen = () => {
          setWsStatus('connected')
          heartbeatTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }))
            }
          }, 30000)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'pong') return

            switch (msg.type) {
              case 'annotation_created':
                setAnnotations((prev) => {
                  if (prev.find((a) => a.id === msg.data.id)) return prev
                  return [msg.data, ...prev]
                })
                break
              case 'annotation_updated':
                setAnnotations((prev) =>
                  prev.map((a) => (a.id === msg.data.id ? msg.data : a))
                )
                break
              case 'annotation_deleted':
                setAnnotations((prev) => prev.filter((a) => a.id !== msg.data.id))
                break
              case 'reply_created':
                setAnnotations((prev) =>
                  prev.map((a) => {
                    if (a.id !== msg.data.annotation_id) return a
                    if (a.replies.find((r) => r.id === msg.data.reply.id)) return a
                    return { ...a, replies: [...(a.replies || []), msg.data.reply] }
                  })
                )
                break
              case 'reply_updated':
                setAnnotations((prev) =>
                  prev.map((a) => {
                    if (a.id !== msg.data.annotation_id) return a
                    return {
                      ...a,
                      replies: (a.replies || []).map((r) =>
                        r.id === msg.data.reply.id ? msg.data.reply : r
                      ),
                    }
                  })
                )
                break
              case 'reply_deleted':
                setAnnotations((prev) =>
                  prev.map((a) => {
                    if (a.id !== msg.data.annotation_id) return a
                    return {
                      ...a,
                      replies: (a.replies || []).filter((r) => r.id !== msg.data.id),
                    }
                  })
                )
                break
              default:
                break
            }
          } catch (e) {
            console.error('处理WS消息失败:', e)
          }
        }

        ws.onclose = () => {
          setWsStatus('disconnected')
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          reconnectTimer = setTimeout(connectWs, 3000)
        }

        ws.onerror = () => {
          try {
            ws.close()
          } catch {}
        }
      } catch (err) {
        console.error('WS连接失败:', err)
        reconnectTimer = setTimeout(connectWs, 5000)
      }
    }

    connectWs()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {}
      }
    }
  }, [id, token])

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

  const handleCreateAnnotation = async (content, color) => {
    const res = await documentAPI.createAnnotation(id, {
      document_id: parseInt(id),
      page: currentPage,
      content,
      color,
    })
    setAnnotations((prev) => [res.data, ...prev])
    setShowAddForm(false)
  }

  const handleUpdateAnnotation = (updated) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    )
  }

  const handleDeleteAnnotation = (annId) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== annId))
  }

  const handleAddReply = (annId, reply) => {
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== annId) return a
        return { ...a, replies: [...(a.replies || []), reply] }
      })
    )
  }

  const buildPreviewUrl = (page) => {
    const token = localStorage.getItem('token') || ''
    let url = `/api/documents/${id}/preview?token=${encodeURIComponent(token)}`
    if (page) url += `&page=${page}`
    url += `&_t=${Date.now()}`
    return url
  }

  const pageAnnotations = annotations.filter((a) => a.page === currentPage)
  const totalPages = previewInfo?.total_pages || 0

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

  return (
    <div className="page-container-wide">
      <div className="preview-with-sidebar">
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
                src={buildPreviewUrl()}
                title={doc.original_filename}
                onError={() => setError('预览加载失败')}
              />
            </div>
          ) : doc.preview_type === 'image' ? (
            <div className="preview-content">
              <img
                key={previewKey}
                src={buildPreviewUrl()}
                alt={doc.original_filename}
              />
            </div>
          ) : doc.preview_type === 'pdf_images' ? (
            <>
              <div className="preview-content">
                {pageAnnotations.length > 0 && (
                  <div className="page-annotation-tags">
                    <strong>本页注释：</strong>
                    {pageAnnotations.map((a, idx) => (
                      <span
                        key={a.id}
                        className="page-annotation-tag"
                        style={{ background: a.color }}
                        title={a.content}
                      >
                        #{idx + 1}
                      </span>
                    ))}
                  </div>
                )}
                <img
                  key={previewKey + '-' + currentPage}
                  src={buildPreviewUrl(currentPage)}
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

        <div className="annotations-sidebar">
          <div className="annotations-header">
            <div>
              <h3>
                💬 协作注释
                <span className="ws-status" data-status={wsStatus}>
                  {wsStatus === 'connected' ? '● 实时同步中' :
                   wsStatus === 'connecting' ? '○ 连接中...' :
                   '○ 已断开'}
                </span>
              </h3>
              <div className="annotations-count">共 {annotations.length} 条注释</div>
            </div>
            <button
              className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => setShowAddForm((v) => !v)}
            >
              {showAddForm ? '取消' : `+ 注释 (第${currentPage}页)`}
            </button>
          </div>

          {showAddForm && (
            <div className="new-annotation-form">
              <div className="form-small-label">将添加到：第 {currentPage} 页</div>
              <AnnotationForm
                onSubmit={handleCreateAnnotation}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}

          <div className="annotations-list">
            {annotationsLoading ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
              </div>
            ) : annotations.length === 0 ? (
              <div className="empty-state">
                <h3>还没有注释</h3>
                <p>点击右上角「添加注释」开始协作</p>
              </div>
            ) : (
              annotations.map((ann) => (
                <AnnotationItem
                  key={ann.id}
                  annotation={ann}
                  docId={id}
                  currentUserId={currentUserId}
                  onUpdate={handleUpdateAnnotation}
                  onDelete={handleDeleteAnnotation}
                  onAddReply={handleAddReply}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
