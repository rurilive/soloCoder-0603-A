import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { translationApi, usersApi, TASK_STATUS, TASK_PRIORITY, LANGUAGES } from '../services/api'
import Modal from '../components/Modal.jsx'

export default function TranslationTasks() {
  const navigate = useNavigate()
  const { showToast, hasRole, currentUser } = useApp()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: '',
    source_language: '',
    target_language: '',
    priority: '',
    mine_only: false,
    created_by_me: false,
  })
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [currentTask, setCurrentTask] = useState(null)
  const [newTask, setNewTask] = useState({
    entry_id: '',
    source_language: 'zh',
    target_languages: [],
    priority: 'normal',
    description: '',
  })
  const [translators, setTranslators] = useState([])
  const [selectedTranslator, setSelectedTranslator] = useState('')
  const [entries, setEntries] = useState([])
  const [stats, setStats] = useState(null)

  useEffect(() => {
    loadData()
  }, [filters])

  useEffect(() => {
    loadTranslators()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = {}
      Object.keys(filters).forEach(k => {
        if (filters[k]) params[k] = filters[k]
      })
      const [tasksRes, statsRes] = await Promise.all([
        translationApi.list(params),
        translationApi.getStats(),
      ])
      setTasks(tasksRes.data)
      setStats(statsRes.data)
    } catch (e) {
      showToast('加载任务失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadTranslators = async () => {
    try {
      const res = await usersApi.listTranslators()
      setTranslators(res.data)
    } catch (e) {}
  }

  const openCreateModal = () => {
    setNewTask({
      entry_id: '',
      source_language: 'zh',
      target_languages: [],
      priority: 'normal',
      description: '',
    })
    setCreateModalOpen(true)
  }

  const handleCreateTask = async () => {
    if (!newTask.entry_id || newTask.target_languages.length === 0) {
      showToast('请填写完整信息', 'error')
      return
    }
    try {
      await translationApi.create({
        entry_id: parseInt(newTask.entry_id),
        source_language: newTask.source_language,
        target_language: newTask.target_languages[0],
        target_languages: newTask.target_languages,
        priority: newTask.priority,
        description: newTask.description,
      })
      showToast('翻译任务创建成功')
      setCreateModalOpen(false)
      loadData()
    } catch (e) {
      showToast(e.response?.data?.detail || '创建失败', 'error')
    }
  }

  const openAssignModal = (task) => {
    setCurrentTask(task)
    setSelectedTranslator(task.assignee_id?.toString() || '')
    setAssignModalOpen(true)
  }

  const handleAssign = async () => {
    if (!selectedTranslator || !currentTask) return
    try {
      await translationApi.assign(currentTask.id, parseInt(selectedTranslator))
      showToast('任务分配成功')
      setAssignModalOpen(false)
      loadData()
    } catch (e) {
      showToast(e.response?.data?.detail || '分配失败', 'error')
    }
  }

  const handleStatusChange = async (taskId, newStatus, comment = '') => {
    try {
      await translationApi.updateStatus(taskId, newStatus, comment)
      showToast('状态更新成功')
      loadData()
    } catch (e) {
      showToast(e.response?.data?.detail || '操作失败', 'error')
    }
  }

  const getAvailableActions = (task) => {
    const actions = []
    const canAssign = hasRole('admin', 'editor')
    const isAssignee = currentUser?.id === task.assignee_id
    const canReview = hasRole('admin', 'reviewer', 'editor')
    const isCreator = currentUser?.id === task.created_by_id

    if (canAssign && ['pending', 'rejected'].includes(task.status)) {
      actions.push({ key: 'assign', label: '分配', onClick: () => openAssignModal(task), color: 'primary' })
    }
    if (isAssignee && task.status === 'assigned') {
      actions.push({ key: 'start', label: '开始翻译', onClick: () => handleStatusChange(task.id, 'in_progress'), color: 'primary' })
    }
    if (isAssignee && task.status === 'in_progress') {
      actions.push({ key: 'complete', label: '翻译完成', onClick: () => handleStatusChange(task.id, 'completed'), color: 'success' })
    }
    if ((isCreator || canReview) && task.status === 'completed') {
      actions.push({ key: 'review', label: '提交审校', onClick: () => handleStatusChange(task.id, 'reviewing'), color: 'primary' })
    }
    if (canReview && task.status === 'reviewing') {
      actions.push({ key: 'approve', label: '通过', onClick: () => handleStatusChange(task.id, 'approved', '审校通过'), color: 'success' })
      actions.push({ key: 'reject', label: '驳回', onClick: () => handleStatusChange(task.id, 'rejected', '审校驳回，请修改'), color: 'danger' })
    }
    actions.push({ key: 'detail', label: '详情', onClick: () => navigate(`/translation/${task.id}`), color: 'outline' })
    return actions
  }

  const getStatusBadge = (status) => {
    const cfg = TASK_STATUS[status] || { label: status, color: '#9e9e9e' }
    return <span className="status-badge" style={{ background: cfg.color }}>{cfg.label}</span>
  }

  const getPriorityBadge = (priority) => {
    const cfg = TASK_PRIORITY[priority] || { label: priority, color: '#9e9e9e' }
    return <span className="priority-badge" style={{ borderColor: cfg.color, color: cfg.color }}>{cfg.label}</span>
  }

  const getLangName = (code) => LANGUAGES.find(l => l.code === code)?.name || code

  return (
    <div className="page">
      <div className="page-header">
        <h1>翻译任务管理</h1>
        {hasRole('admin', 'editor') && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            + 创建翻译任务
          </button>
        )}
      </div>

      {stats && (
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">全部任务</div>
          </div>
          <div className="stat-card stat-blue">
            <div className="stat-value">{stats.pending + stats.assigned}</div>
            <div className="stat-label">待翻译</div>
          </div>
          <div className="stat-card stat-orange">
            <div className="stat-value">{stats.in_progress}</div>
            <div className="stat-label">翻译中</div>
          </div>
          <div className="stat-card stat-purple">
            <div className="stat-value">{stats.completed + stats.reviewing}</div>
            <div className="stat-label">待审校</div>
          </div>
          <div className="stat-card stat-green">
            <div className="stat-value">{stats.approved}</div>
            <div className="stat-label">已通过</div>
          </div>
        </div>
      )}

      <div className="filters-bar">
        <select
          className="form-input form-select"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">全部状态</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="form-input form-select"
          value={filters.source_language}
          onChange={(e) => setFilters({ ...filters, source_language: e.target.value })}
        >
          <option value="">源语言全部</option>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <select
          className="form-input form-select"
          value={filters.target_language}
          onChange={(e) => setFilters({ ...filters, target_language: e.target.value })}
        >
          <option value="">目标语言全部</option>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <label className="checkbox-label">
          <input type="checkbox" checked={filters.mine_only} onChange={(e) => setFilters({ ...filters, mine_only: e.target.checked })} />
          只看分配给我的
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={filters.created_by_me} onChange={(e) => setFilters({ ...filters, created_by_me: e.target.checked })} />
          只看我创建的
        </label>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>内容条目</th>
              <th>语言方向</th>
              <th>状态</th>
              <th>优先级</th>
              <th>进度</th>
              <th>创建人</th>
              <th>翻译人员</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" className="text-center">加载中...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan="10" className="text-center">暂无数据</td></tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id}>
                  <td>#{task.id}</td>
                  <td>条目 #{task.entry_id}</td>
                  <td>
                    <span className="lang-pair">
                      {getLangName(task.source_language)} → {getLangName(task.target_language)}
                    </span>
                  </td>
                  <td>{getStatusBadge(task.status)}</td>
                  <td>{getPriorityBadge(task.priority)}</td>
                  <td>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                      <span className="progress-text">{task.progress}%</span>
                    </div>
                  </td>
                  <td>{task.created_by?.full_name || task.created_by?.username || '-'}</td>
                  <td>{task.assignee?.full_name || task.assignee?.username || '-'}</td>
                  <td className="text-muted">{new Date(task.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      {getAvailableActions(task).map(act => (
                        <button
                          key={act.key}
                          className={`btn btn-${act.color} btn-sm`}
                          onClick={act.onClick}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="创建翻译任务"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setCreateModalOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleCreateTask}>创建</button>
          </>
        }
      >
        <div className="form-group">
          <label>内容条目ID</label>
          <input
            type="number"
            className="form-input"
            value={newTask.entry_id}
            onChange={(e) => setNewTask({ ...newTask, entry_id: e.target.value })}
            placeholder="输入条目ID，例如：1"
          />
          <small className="text-muted">提示：可在内容编辑页点击"发起翻译"自动填写</small>
        </div>
        <div className="form-group">
          <label>源语言</label>
          <select className="form-input form-select" value={newTask.source_language}
            onChange={(e) => setNewTask({ ...newTask, source_language: e.target.value })}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>目标语言（可多选）</label>
          <div className="checkbox-group">
            {LANGUAGES.filter(l => l.code !== newTask.source_language).map(l => (
              <label key={l.code} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newTask.target_languages.includes(l.code)}
                  onChange={(e) => {
                    const langs = e.target.checked
                      ? [...newTask.target_languages, l.code]
                      : newTask.target_languages.filter(x => x !== l.code)
                    setNewTask({ ...newTask, target_languages: langs })
                  }}
                />
                {l.name}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>优先级</label>
          <select className="form-input form-select" value={newTask.priority}
            onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
            {Object.entries(TASK_PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>任务说明（可选）</label>
          <textarea className="form-input" rows="3"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            placeholder="翻译要求或注意事项"
          />
        </div>
      </Modal>

      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="分配翻译任务"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setAssignModalOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleAssign}>确认分配</button>
          </>
        }
      >
        {currentTask && (
          <div>
            <div className="form-group">
              <label>任务信息</label>
              <div className="task-info-box">
                <p><strong>任务ID：</strong> #{currentTask.id}</p>
                <p><strong>语言：</strong> {getLangName(currentTask.source_language)} → {getLangName(currentTask.target_language)}</p>
                <p><strong>优先级：</strong> {TASK_PRIORITY[currentTask.priority]?.label}</p>
              </div>
            </div>
            <div className="form-group">
              <label>选择翻译人员</label>
              <select className="form-input form-select" value={selectedTranslator}
                onChange={(e) => setSelectedTranslator(e.target.value)}>
                <option value="">-- 请选择 --</option>
                {translators.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.avatar} {t.full_name || t.username} ({t.email})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
