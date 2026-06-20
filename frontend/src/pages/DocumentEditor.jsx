import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { documentAPI } from '../api.js'

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

const EDITABLE_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml',
  'ini', 'cfg', 'conf', 'py', 'js', 'ts', 'html', 'css',
])

function isEditableFile(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return EDITABLE_EXTENSIONS.has(ext)
}

function transformRemoteOpAgainstPending(remoteOp, pendingOps) {
  let offset = 0
  for (const pending of pendingOps) {
    if (pending.type === 'insert') {
      if (pending.position <= remoteOp.position) {
        offset += pending.text ? pending.text.length : 0
      }
    } else if (pending.type === 'delete') {
      const pendLen = pending.length || 0
      if (pending.position + pendLen <= remoteOp.position) {
        offset -= pendLen
      } else if (pending.position < remoteOp.position) {
        const overlap = Math.min(pendLen, remoteOp.position - pending.position)
        offset -= overlap
      }
    }
  }
  const transformed = { ...remoteOp, position: remoteOp.position + offset }
  return transformed
}

function transformPendingAgainstRemote(pendingOps, remoteOp) {
  const result = []
  for (const pending of pendingOps) {
    const transformed = { ...pending }
    if (remoteOp.type === 'insert') {
      const insLen = remoteOp.text ? remoteOp.text.length : 0
      if (remoteOp.position <= pending.position) {
        transformed.position = pending.position + insLen
      }
    } else if (remoteOp.type === 'delete') {
      const delLen = remoteOp.length || 0
      if (remoteOp.position + delLen <= pending.position) {
        transformed.position = pending.position - delLen
      } else if (remoteOp.position < pending.position) {
        const overlap = Math.min(delLen, pending.position - remoteOp.position)
        transformed.position = pending.position - overlap
      }
    }
    result.push(transformed)
  }
  return result
}

function VersionPanel({ docId, onRestore, currentVersion }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingVersion, setViewingVersion] = useState(null)
  const [viewContent, setViewContent] = useState('')
  const [restoring, setRestoring] = useState(false)

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await documentAPI.listVersions(docId)
      setVersions(res.data)
    } catch (err) {
      console.error('加载版本历史失败:', err)
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleViewVersion = async (ver) => {
    try {
      const res = await documentAPI.getVersion(docId, ver.id)
      setViewContent(res.data.content)
      setViewingVersion(ver)
    } catch (err) {
      alert('加载版本内容失败')
    }
  }

  const handleRestore = async (ver) => {
    if (!confirm(`确定要恢复到版本 ${ver.version} 吗？`)) return
    setRestoring(true)
    try {
      await onRestore(ver.id)
      await fetchVersions()
      setViewingVersion(null)
    } catch (err) {
      alert(err.response?.data?.detail || '恢复版本失败')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="version-panel">
      <div className="version-panel-header">
        <h3>版本历史</h3>
        <button
          className="btn btn-secondary btn-sm"
          onClick={fetchVersions}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
        </div>
      ) : versions.length === 0 ? (
        <div className="empty-state" style={{ padding: 20 }}>
          <p>暂无版本记录</p>
          <p style={{ fontSize: 12, marginTop: 8, color: '#888' }}>
            提示：仅「手动保存」才会创建版本
          </p>
        </div>
      ) : (
        <div className="version-list">
          {versions.map((ver) => (
            <div
              key={ver.id}
              className={`version-item ${ver.version === currentVersion ? 'current' : ''}`}
            >
              <div className="version-info">
                <span className="version-number">v{ver.version}</span>
                <span className="version-author">
                  {ver.author?.full_name || ver.author?.username || '未知'}
                </span>
                <span className="version-time">{formatDate(ver.created_at)}</span>
              </div>
              {ver.change_summary && (
                <div className="version-summary">{ver.change_summary}</div>
              )}
              <div className="version-actions">
                <button
                  className="link-btn"
                  onClick={() => handleViewVersion(ver)}
                >
                  查看
                </button>
                {ver.version !== currentVersion && (
                  <button
                    className="link-btn link-danger"
                    onClick={() => handleRestore(ver)}
                    disabled={restoring}
                  >
                    恢复
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingVersion && (
        <div className="version-preview-overlay">
          <div className="version-preview-modal">
            <div className="version-preview-header">
              <h3>版本 {viewingVersion.version} 内容预览</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setViewingVersion(null)}
              >
                关闭
              </button>
            </div>
            <pre className="version-preview-content">{viewContent}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DocumentEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [content, setContent] = useState('')
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  const [wsStatus, setWsStatus] = useState('disconnected')
  const [onlineUsers, setOnlineUsers] = useState([])
  const [showVersionPanel, setShowVersionPanel] = useState(false)

  const wsRef = useRef(null)
  const textareaRef = useRef(null)
  const saveTimerRef = useRef(null)
  const pendingOpsRef = useRef([])
  const currentUser = getCurrentUser()
  const contentRef = useRef('')
  const versionRef = useRef(0)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    versionRef.current = version
  }, [version])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const docRes = await documentAPI.get(id)
      setDoc(docRes.data)

      if (!isEditableFile(docRes.data.original_filename)) {
        setError('该文档类型不支持在线编辑')
        return
      }

      try {
        const contentRes = await documentAPI.getContent(id)
        setContent(contentRes.data.content)
        setVersion(contentRes.data.version)
        contentRef.current = contentRes.data.content
        versionRef.current = contentRes.data.version
      } catch (err) {
        if (err.response?.status === 404) {
          setContent('')
          setVersion(0)
          contentRef.current = ''
          versionRef.current = 0
        } else {
          throw err
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || '加载文档失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const applyRemoteOperation = useCallback((rawOp) => {
    if (!rawOp) return
    const textarea = textareaRef.current
    if (!textarea) return

    const pending = pendingOpsRef.current
    const op = transformRemoteOpAgainstPending(rawOp, pending)
    pendingOpsRef.current = transformPendingAgainstRemote(pending, rawOp)

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const curContent = contentRef.current
    let newContent = curContent

    if (op.type === 'insert' && op.text != null) {
      const pos = Math.min(Math.max(0, op.position), newContent.length)
      newContent = newContent.slice(0, pos) + op.text + newContent.slice(pos)
      let newStart = start
      let newEnd = end
      if (pos <= start) {
        newStart += op.text.length
        newEnd += op.text.length
      } else if (pos <= end) {
        newEnd += op.text.length
      }
      setContent(newContent)
      contentRef.current = newContent
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newStart, newEnd)
        }
      })
    } else if (op.type === 'delete' && op.length != null) {
      const pos = Math.min(Math.max(0, op.position), newContent.length)
      const delLen = Math.min(op.length, newContent.length - pos)
      newContent = newContent.slice(0, pos) + newContent.slice(pos + delLen)
      let newStart = start
      let newEnd = end
      if (pos <= start) {
        newStart = Math.max(pos, start - delLen)
        newEnd = Math.max(pos, end - delLen)
      } else if (pos < end) {
        newEnd = Math.max(pos, end - delLen)
      }
      setContent(newContent)
      contentRef.current = newContent
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newStart, newEnd)
        }
      })
    } else if (op.type === 'replace' && op.text != null) {
      newContent = op.text
      setContent(newContent)
      contentRef.current = newContent
      pendingOpsRef.current = []
    }
  }, [])

  const sendEditOperation = useCallback((operation) => {
    pendingOpsRef.current.push({ ...operation })
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'edit',
        operation,
        full_content: contentRef.current,
        base_version: versionRef.current,
      }))
    }
  }, [])

  useEffect(() => {
    if (!id || !currentUser) return

    let reconnectTimer = null
    let heartbeatTimer = null

    const connectWs = () => {
      try {
        const wsUrl = documentAPI.getEditWsUrl(id)
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
              case 'presence':
                setOnlineUsers(msg.users || [])
                break
              case 'user_joined':
                setOnlineUsers((prev) => {
                  if (prev.find((u) => u.id === msg.user.id)) return prev
                  return [...prev, msg.user]
                })
                break
              case 'user_left':
                setOnlineUsers((prev) => prev.filter((u) => u.id !== msg.user.id))
                break
              case 'edit':
                if (msg.user_id !== currentUser?.id) {
                  if (msg.operation) {
                    applyRemoteOperation(msg.operation)
                  }
                }
                break
              case 'auto_saved':
                setVersion(msg.version)
                versionRef.current = msg.version
                pendingOpsRef.current = []
                break
              case 'save_ack':
                setVersion(msg.version)
                versionRef.current = msg.version
                pendingOpsRef.current = []
                break
              case 'content_saved':
                setVersion(msg.version)
                versionRef.current = msg.version
                pendingOpsRef.current = []
                break
              case 'content_updated':
                setContent(msg.content)
                contentRef.current = msg.content
                setVersion(msg.version)
                versionRef.current = msg.version
                setDirty(false)
                pendingOpsRef.current = []
                break
              case 'save_conflict':
                console.warn('保存冲突，需要手动处理:', msg)
                break
              default:
                break
            }
          } catch (e) {
            console.error('处理编辑WS消息失败:', e)
          }
        }

        ws.onclose = () => {
          setWsStatus('disconnected')
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          reconnectTimer = setTimeout(connectWs, 3000)
        }

        ws.onerror = () => {
          try { ws.close() } catch {}
        }
      } catch (err) {
        console.error('编辑WS连接失败:', err)
        reconnectTimer = setTimeout(connectWs, 5000)
      }
    }

    connectWs()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
    }
  }, [id, currentUser, applyRemoteOperation])

  const handleChange = useCallback((e) => {
    const newValue = e.target.value
    const oldValue = contentRef.current
    setContent(newValue)
    contentRef.current = newValue
    setDirty(true)

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      handleSave(newValue)
    }, 3000)

    const newLen = newValue.length
    const oldLen = oldValue.length

    if (newLen > oldLen) {
      const cursorPos = e.target.selectionStart
      const insertedText = newValue.slice(cursorPos - (newLen - oldLen), cursorPos)
      if (insertedText) {
        sendEditOperation({
          type: 'insert',
          position: cursorPos - insertedText.length,
          text: insertedText,
        })
      }
    } else if (newLen < oldLen) {
      const cursorPos = e.target.selectionStart
      const deletedLen = oldLen - newLen
      sendEditOperation({
        type: 'delete',
        position: cursorPos,
        length: deletedLen,
      })
    }
  }, [sendEditOperation])

  const handleSave = async (contentToSave) => {
    const text = contentToSave !== undefined ? contentToSave : contentRef.current
    if (!text && text !== '') return
    setSaving(true)
    try {
      const res = await documentAPI.updateContent(id, {
        content: text,
        base_version: versionRef.current,
        change_summary: 'Auto save',
      })
      setVersion(res.data.version)
      versionRef.current = res.data.version
      pendingOpsRef.current = []
      setDirty(false)
    } catch (err) {
      if (err.response?.status === 409) {
        const detail = err.response.data?.detail
        if (detail && detail.current_content !== undefined) {
          const proceed = confirm(
            '文档已被其他人修改，是否用您的版本覆盖？\n点击"确定"覆盖，"取消"加载最新版本。'
          )
          if (proceed) {
            try {
              const retryRes = await documentAPI.updateContent(id, {
                content: text,
                base_version: detail.current_version,
                change_summary: 'Force overwrite',
              })
              setVersion(retryRes.data.version)
              versionRef.current = retryRes.data.version
              setContent(retryRes.data.content)
              contentRef.current = retryRes.data.content
              pendingOpsRef.current = []
              setDirty(false)
            } catch (retryErr) {
              alert('保存失败: ' + (retryErr.response?.data?.detail || '未知错误'))
            }
          } else {
            setContent(detail.current_content)
            contentRef.current = detail.current_content
            setVersion(detail.current_version)
            versionRef.current = detail.current_version
            pendingOpsRef.current = []
            setDirty(false)
          }
        }
      } else {
        alert(err.response?.data?.detail || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleManualSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    handleSave(contentRef.current)
  }

  const handleRestoreVersion = async (versionId) => {
    const res = await documentAPI.restoreVersion(id, versionId)
    setContent(res.data.content)
    contentRef.current = res.data.content
    setVersion(res.data.version)
    versionRef.current = res.data.version
    setDirty(false)
    pendingOpsRef.current = []
  }

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleManualSave()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.target
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const curContent = contentRef.current
      const newContent = curContent.slice(0, start) + '  ' + curContent.slice(end)
      setContent(newContent)
      contentRef.current = newContent
      setDirty(true)
      requestAnimationFrame(() => {
        textarea.setSelectionRange(start + 2, start + 2)
      })
      sendEditOperation({
        type: 'insert',
        position: start,
        text: '  ',
      })
    }
  }, [sendEditOperation])

  const lineCount = content.split('\n').length

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="loading-spinner"></div>
          <p style={{ marginTop: 16, color: '#5f6368' }}>加载编辑器...</p>
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
    <div className="editor-page">
      <div className="editor-toolbar">
        <div className="editor-toolbar-left">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/preview/${id}`)}
          >
            ← 返回预览
          </button>
          <h2 className="editor-title">✏️ {doc.original_filename}</h2>
        </div>
        <div className="editor-toolbar-right">
          <span className="editor-meta">
            {lineCount} 行 · {content.length} 字符 · v{version}
          </span>
          {dirty && <span className="editor-dirty">● 未保存</span>}
          <button
            className={`btn btn-primary btn-sm ${saving ? 'saving' : ''}`}
            onClick={handleManualSave}
            disabled={saving}
            title="手动保存（创建版本记录）"
          >
            {saving ? '保存中...' : '保存 (Ctrl+S)'}
          </button>
          <button
            className={`btn btn-sm ${showVersionPanel ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowVersionPanel((v) => !v)}
          >
            版本历史
          </button>
        </div>
      </div>

      <div className="editor-collab-bar">
        <div className="collab-status">
          <span className={`ws-status ${wsStatus}`} data-status={wsStatus}>
            {wsStatus === 'connected' ? '● 实时同步中' :
             wsStatus === 'connecting' ? '○ 连接中...' :
             '○ 已断开'}
          </span>
          {onlineUsers.length > 0 && (
            <div className="online-users">
              <span className="online-count">{onlineUsers.length} 人在线</span>
              <div className="online-avatars">
                {onlineUsers.map((u) => (
                  <span key={u.id} className="online-avatar" title={u.username}>
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>
          ⚙️ 自动保存（每3秒）只更新内容，手动保存才创建版本
        </div>
      </div>

      <div className="editor-body">
        <div className={`editor-main ${showVersionPanel ? 'with-sidebar' : ''}`}>
          <div className="editor-line-numbers">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="line-number">{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="开始输入内容..."
          />
        </div>

        {showVersionPanel && (
          <div className="editor-sidebar">
            <VersionPanel
              docId={id}
              onRestore={handleRestoreVersion}
              currentVersion={version}
            />
          </div>
        )}
      </div>
    </div>
  )
}
