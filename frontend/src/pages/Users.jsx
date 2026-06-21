import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { usersApi, ROLE_LABELS } from '../services/api'
import Modal from '../components/Modal.jsx'

export default function Users() {
  const { showToast } = useApp()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [roleModal, setRoleModal] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [selectedRoles, setSelectedRoles] = useState([])
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    is_active: true,
    avatar: '',
    role_ids: [],
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [uRes, rRes] = await Promise.all([
        usersApi.list(),
        usersApi.listRoles(),
      ])
      setUsers(uRes.data)
      setRoles(rRes.data)
    } catch (e) {
      showToast('加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setCurrentUser(null)
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      is_active: true,
      avatar: '',
      role_ids: [],
    })
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setCurrentUser(user)
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name || '',
      password: '',
      is_active: user.is_active,
      avatar: user.avatar || '',
      role_ids: [],
    })
    setModalOpen(true)
  }

  const openRoleAssign = (user) => {
    setCurrentUser(user)
    setSelectedRoles(user.roles?.map(r => r.id) || [])
    setRoleModal(true)
  }

  const handleSubmit = async () => {
    try {
      if (currentUser) {
        const updateData = { ...formData }
        if (!updateData.password) delete updateData.password
        await usersApi.update(currentUser.id, updateData)
        showToast('用户更新成功')
      } else {
        await usersApi.create(formData)
        showToast('用户创建成功')
      }
      setModalOpen(false)
      loadData()
    } catch (e) {
      showToast(e.response?.data?.detail || '操作失败', 'error')
    }
  }

  const handleRoleSubmit = async () => {
    if (!currentUser) return
    try {
      await usersApi.assignRoles(currentUser.id, selectedRoles)
      showToast('角色分配成功')
      setRoleModal(false)
      loadData()
    } catch (e) {
      showToast(e.response?.data?.detail || '操作失败', 'error')
    }
  }

  const toggleActive = async (user) => {
    try {
      if (user.is_active) {
        await usersApi.deactivate(user.id)
      } else {
        await usersApi.activate(user.id)
      }
      showToast(user.is_active ? '已禁用' : '已启用')
      loadData()
    } catch (e) {
      showToast('操作失败', 'error')
    }
  }

  const getRoleBadges = (userRoles) => {
    return userRoles?.map(r => {
      const cfg = ROLE_LABELS[r.name] || { label: r.name, color: '#9e9e9e' }
      return (
        <span key={r.id} className="role-badge" style={{ background: cfg.color }}>
          {cfg.label}
        </span>
      )
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>用户管理</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ 新建用户</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>头像</th>
              <th>用户名</th>
              <th>姓名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="8" className="text-center">暂无用户</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id}>
                  <td><div className="user-avatar-large">{u.avatar || '👤'}</div></td>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.full_name || '-'}</td>
                  <td className="text-muted">{u.email}</td>
                  <td>{getRoleBadges(u.roles)}</td>
                  <td>
                    <span className={`status-badge ${u.is_active ? 'bg-green' : 'bg-gray'}`}>
                      {u.is_active ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>编辑</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openRoleAssign(u)}>分配角色</button>
                      <button
                        className={`btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-success'}`}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? '禁用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={currentUser ? '编辑用户' : '新建用户'}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModalOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSubmit}>保存</button>
          </>
        }
      >
        <div className="form-group">
          <label>用户名 *</label>
          <input
            type="text" className="form-input"
            value={formData.username}
            disabled={!!currentUser}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>邮箱 *</label>
          <input
            type="email" className="form-input"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>姓名</label>
          <input
            type="text" className="form-input"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>头像（emoji 或 URL）</label>
          <input
            type="text" className="form-input"
            value={formData.avatar}
            onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
            placeholder="如：👨‍💼"
          />
        </div>
        {!currentUser && (
          <div className="form-group">
            <label>初始密码 *</label>
            <input
              type="password" className="form-input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
        )}
        {currentUser && (
          <div className="form-group">
            <label>重置密码（留空不修改）</label>
            <input
              type="password" className="form-input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="输入新密码..."
            />
          </div>
        )}
        <div className="form-group">
          <label>初始角色（可多选）</label>
          <div className="checkbox-group">
            {roles.map(r => (
              <label key={r.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.role_ids.includes(r.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...formData.role_ids, r.id]
                      : formData.role_ids.filter(x => x !== r.id)
                    setFormData({ ...formData, role_ids: ids })
                  }}
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            启用用户
          </label>
        </div>
      </Modal>

      <Modal
        open={roleModal}
        onClose={() => setRoleModal(false)}
        title={`分配角色 - ${currentUser?.full_name || currentUser?.username}`}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setRoleModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleRoleSubmit}>确认</button>
          </>
        }
      >
        <div className="form-group">
          <label>选择角色</label>
          <div className="checkbox-group">
            {roles.map(r => (
              <label key={r.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(r.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...selectedRoles, r.id]
                      : selectedRoles.filter(x => x !== r.id)
                    setSelectedRoles(ids)
                  }}
                />
                <strong>{r.name}</strong>
                <span className="text-muted" style={{ marginLeft: 8 }}>— {r.description}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
