import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { translationApi, TASK_STATUS, LANGUAGES } from '../services/api'
import Modal from '../components/Modal.jsx'

export default function ReviewWorkbench() {
  const navigate = useNavigate()
  const { showToast, hasRole, currentUser } = useApp()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewModal, setReviewModal] = useState(false)
  const [currentTask, setCurrentTask] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const [tab, setTab] = useState('pending')

  useEffect(() => {
    loadTasks()
  }, [tab])

  const loadTasks = async () => {
    setLoading(true)
    try {
      let params = {}
      if (tab === 'pending') {
        params.status = 'reviewing'
      } else if (tab === 'approved') {
        params.status = 'approved'
      } else if (tab === 'rejected') {
        params.status = 'rejected'
      }
      const res = await translationApi.list(params)
      setTasks(res.data)
    } catch (e) {
      showToast('加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openReview = (task) => {
    setCurrentTask(task)
    setReviewComment('')
    setReviewModal(true)
  }

  const handleReview = async (result) => {
    if (!currentTask) return
    try {
      await translationApi.updateStatus(currentTask.id, result, reviewComment)
      showToast(result === 'approved' ? '审校通过' : '已驳回')
      setReviewModal(false)
      loadTasks()
    } catch (e) {
      showToast(e.response?.data?.detail || '操作失败', 'error')
    }
  }

  const getLangName = (code) => LANGUAGES.find(l => l.code === code)?.name || code

  const tabs = [
    { key: 'pending', label: `待审校` },
    { key: 'approved', label: `已通过` },
    { key: 'rejected', label: `已驳回` },
    { key: 'all', label: `全部` },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>审校工作台</h1>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>条目</th>
              <th>语言方向</th>
              <th>状态</th>
              <th>进度</th>
              <th>翻译人员</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center">加载中...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan="8" className="text-center">暂无数据</td></tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id}>
                  <td>#{task.id}</td>
                  <td>条目 #{task.entry_id}</td>
                  <td>{getLangName(task.source_language)} → {getLangName(task.target_language)}</td>
                  <td>
                    <span className="status-badge" style={{ background: TASK_STATUS[task.status]?.color }}>
                      {TASK_STATUS[task.status]?.label}
                    </span>
                  </td>
                  <td>
                    <div className="progress-bar small">
                      <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="text-muted">{task.progress}%</span>
                  </td>
                  <td>{task.assignee?.full_name || task.assignee?.username || '-'}</td>
                  <td className="text-muted">{new Date(task.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="action-buttons">
                      {task.status === 'reviewing' && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => openReview(task)}>审校</button>
                        </>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/translation/${task.id}`)}>详情</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={reviewModal}
        onClose={() => setReviewModal(false)}
        title="翻译审校"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setReviewModal(false)}>取消</button>
            <button className="btn btn-danger" onClick={() => handleReview('rejected')}>驳回</button>
            <button className="btn btn-success" onClick={() => handleReview('approved')}>通过</button>
          </>
        }
      >
        {currentTask && (
          <div>
            <div className="task-info-box">
              <p><strong>任务ID：</strong> #{currentTask.id}</p>
              <p><strong>语言：</strong> {getLangName(currentTask.source_language)} → {getLangName(currentTask.target_language)}</p>
              <p><strong>翻译人员：</strong> {currentTask.assignee?.full_name || '-'}</p>
              <p><strong>进度：</strong> {currentTask.progress}%</p>
            </div>

            <h4 style={{ marginTop: 16 }}>译文预览</h4>
            <div className="translation-preview">
              {Object.entries(currentTask.translated_field_values || {}).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>【{k}】原文：</div>
                  <div className="source-content"
                    dangerouslySetInnerHTML={{
                      __html: typeof currentTask.source_field_values?.[k] === 'string'
                        ? currentTask.source_field_values[k]
                        : JSON.stringify(currentTask.source_field_values?.[k] || '')
                    }}
                  />
                  <div style={{ fontSize: 12, color: '#666', margin: '8px 0 4px' }}>译文：</div>
                  <div className="target-content"
                    dangerouslySetInnerHTML={{
                      __html: typeof v === 'string' ? v : JSON.stringify(v || '')
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="form-group" style={{ marginTop: 16 }}>
              <label>审校意见</label>
              <textarea
                className="form-input"
                rows="3"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="请填写审校意见..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
