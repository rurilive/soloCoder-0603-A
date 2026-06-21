import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { translationApi, TASK_STATUS, TASK_PRIORITY, LANGUAGES } from '../services/api'

export default function TranslationTaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast, hasRole, currentUser } = useApp()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [translatedFields, setTranslatedFields] = useState({})
  const [progress, setProgress] = useState(0)
  const [comment, setComment] = useState('')
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    loadTask()
  }, [id])

  const loadTask = async () => {
    setLoading(true)
    try {
      const res = await translationApi.get(id)
      setTask(res.data)
      setTranslatedFields(res.data.translated_field_values || {})
      setProgress(res.data.progress || 0)
    } catch (e) {
      showToast('加载任务详情失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTranslation = async () => {
    try {
      await translationApi.update(task.id, {
        translated_field_values: translatedFields,
        progress,
      })
      showToast('翻译内容已保存')
      loadTask()
    } catch (e) {
      showToast(e.response?.data?.detail || '保存失败', 'error')
    }
  }

  const handleStatusChange = async (status, commentMsg = '') => {
    try {
      await translationApi.updateStatus(task.id, status, commentMsg || comment)
      showToast('状态更新成功')
      setComment('')
      loadTask()
    } catch (e) {
      showToast(e.response?.data?.detail || '操作失败', 'error')
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    try {
      await translationApi.addComment(task.id, newComment)
      setNewComment('')
      showToast('评论已添加')
      loadTask()
    } catch (e) {
      showToast('评论失败', 'error')
    }
  }

  const getLangName = (code) => LANGUAGES.find(l => l.code === code)?.name || code

  if (loading) return <div className="text-center p-4">加载中...</div>
  if (!task) return <div className="text-center p-4">任务不存在</div>

  const isAssignee = currentUser?.id === task.assignee_id
  const canEdit = hasRole('admin') || isAssignee
  const canReview = hasRole('admin', 'reviewer', 'editor')
  const isCreator = currentUser?.id === task.created_by_id

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← 返回</button>
          <h1 style={{ display: 'inline-block', marginLeft: 12 }}>
            翻译任务 #{task.id}
          </h1>
          <span className="status-badge" style={{ background: TASK_STATUS[task.status]?.color, marginLeft: 12 }}>
            {TASK_STATUS[task.status]?.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAssignee && ['assigned'].includes(task.status) && (
            <button className="btn btn-primary" onClick={() => handleStatusChange('in_progress')}>开始翻译</button>
          )}
          {isAssignee && task.status === 'in_progress' && (
            <button className="btn btn-success" onClick={() => handleStatusChange('completed')}>翻译完成</button>
          )}
          {(isCreator || canReview) && task.status === 'completed' && (
            <button className="btn btn-primary" onClick={() => handleStatusChange('reviewing')}>提交审校</button>
          )}
          {canReview && task.status === 'reviewing' && (
            <>
              <button className="btn btn-success" onClick={() => handleStatusChange('approved', '审校通过')}>审校通过</button>
              <button className="btn btn-danger" onClick={() => handleStatusChange('rejected', '审校驳回')}>审校驳回</button>
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>任务信息</h3>
          <div className="info-list">
            <div className="info-item"><span>语言：</span><strong>{getLangName(task.source_language)} → {getLangName(task.target_language)}</strong></div>
            <div className="info-item"><span>内容条目：</span>#{task.entry_id}</div>
            <div className="info-item"><span>优先级：</span>
              <span style={{ color: TASK_PRIORITY[task.priority]?.color }}>
                {TASK_PRIORITY[task.priority]?.label}
              </span>
            </div>
            <div className="info-item"><span>进度：</span>
              <div style={{ flex: 1, marginLeft: 12 }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <strong style={{ marginLeft: 8 }}>{progress}%</strong>
            </div>
            <div className="info-item"><span>创建人：</span>{task.created_by?.full_name || task.created_by?.username}</div>
            <div className="info-item"><span>翻译人员：</span>{task.assignee?.full_name || task.assignee?.username || '未分配'}</div>
            {task.deadline && <div className="info-item"><span>截止时间：</span>{new Date(task.deadline).toLocaleString()}</div>}
            {task.description && <div className="info-item info-item-row"><span>任务说明：</span><p>{task.description}</p></div>}
          </div>
        </div>

        <div className="card">
          <h3>操作历史</h3>
          <div className="timeline">
            {task.history?.map(h => (
              <div key={h.id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <strong>{h.user?.full_name || h.user?.username}</strong>
                    <span className="text-muted">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <div className="timeline-action">
                    {h.old_status && h.new_status && (
                      <span className="status-transition">
                        {TASK_STATUS[h.old_status]?.label} → <strong>{TASK_STATUS[h.new_status]?.label}</strong>
                      </span>
                    )}
                  </div>
                  {h.comment && <div className="timeline-comment">💬 {h.comment}</div>}
                </div>
              </div>
            ))}
            {(!task.history || task.history.length === 0) && <p className="text-muted">暂无历史记录</p>}
          </div>
        </div>
      </div>

      <div className="card mt-lg">
        <h3>翻译内容对照</h3>
        {canEdit && task.status !== 'approved' && task.assignee_id && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <label>整体进度：</label>
            <input type="range" min="0" max="100" value={progress}
              onChange={(e) => setProgress(parseInt(e.target.value))}
              style={{ flex: 1, maxWidth: 200 }} />
            <span>{progress}%</span>
            <button className="btn btn-primary btn-sm" onClick={handleSaveTranslation}>💾 保存翻译</button>
          </div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>字段名</th>
              <th style={{ width: '40%' }}>原文 ({getLangName(task.source_language)})</th>
              <th style={{ width: '40%' }}>
                译文 ({getLangName(task.target_language)})
                {canEdit && task.status !== 'approved' && task.assignee_id && (
                  <span className="text-muted" style={{ fontWeight: 'normal', marginLeft: 8 }}>（可编辑）</span>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(task.source_field_values || {}).map(([field, value]) => (
              <tr key={field}>
                <td><strong>{field}</strong></td>
                <td>
                  <div className="source-content" dangerouslySetInnerHTML={{ __html: typeof value === 'string' ? value : JSON.stringify(value) }} />
                </td>
                <td>
                  {canEdit && task.status !== 'approved' && task.assignee_id ? (
                    <textarea
                      className="form-input"
                      rows="3"
                      value={translatedFields[field] || ''}
                      onChange={(e) => setTranslatedFields({ ...translatedFields, [field]: e.target.value })}
                      placeholder={`请输入${field}的译文`}
                    />
                  ) : (
                    <div className="target-content"
                      dangerouslySetInnerHTML={{
                        __html: typeof translatedFields[field] === 'string'
                          ? translatedFields[field]
                          : (typeof translatedFields[field] !== 'undefined' ? JSON.stringify(translatedFields[field]) : '<em class="text-muted">（暂无译文）</em>')
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
            {(!task.source_field_values || Object.keys(task.source_field_values).length === 0) && (
              <tr><td colSpan="3" className="text-center text-muted">暂无字段内容</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {task.reviews && task.reviews.length > 0 && (
        <div className="card mt-lg">
          <h3>审校记录</h3>
          <div className="reviews-list">
            {task.reviews.map(r => (
              <div key={r.id} className="review-item">
                <div className="review-header">
                  <div>
                    <strong>{r.reviewer?.full_name || r.reviewer?.username}</strong>
                    <span className={`status-badge review-badge review-${r.status}`} style={{ marginLeft: 8 }}>
                      {r.status === 'approved' ? '通过' : r.status === 'rejected' ? '驳回' : '待处理'}
                    </span>
                  </div>
                  <span className="text-muted">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                {r.comment && <p style={{ marginTop: 8 }}>💬 {r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-lg">
        <h3>评论/交流</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            className="form-input"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="输入评论内容..."
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
          />
          <button className="btn btn-primary" onClick={handleAddComment}>发送</button>
        </div>
        <div className="comments-list">
          {task.comments?.map(c => (
            <div key={c.id} className="comment-item">
              <div className="comment-header">
                <strong>{c.user?.full_name || c.user?.username}</strong>
                <span className="text-muted">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p>{c.content}</p>
            </div>
          ))}
          {(!task.comments || task.comments.length === 0) && <p className="text-muted">暂无评论</p>}
        </div>
      </div>
    </div>
  )
}
