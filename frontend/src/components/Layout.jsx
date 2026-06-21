import React from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import LoginModal from './LoginModal.jsx'
import { ROLE_LABELS } from '../services/api'

export default function Layout() {
  const { currentUser, userRoles, logout, hasRole } = useApp()
  const navigate = useNavigate()

  const menuItems = [
    { path: '/', label: '仪表盘', icon: '📊', roles: ['admin', 'editor', 'translator', 'reviewer'] },
    { path: '/content-types', label: '内容类型', icon: '📋', roles: ['admin', 'editor'] },
    { path: '/translation', label: '翻译任务', icon: '🌐', roles: ['admin', 'editor', 'translator', 'reviewer'] },
    { path: '/translation/review', label: '审校工作台', icon: '✅', roles: ['admin', 'reviewer', 'editor'] },
    { path: '/users', label: '用户管理', icon: '👥', roles: ['admin'] },
  ]

  const visibleMenu = menuItems.filter(item =>
    item.roles.some(r => hasRole(r))
  )

  const getUserRoleBadges = () => {
    return userRoles.map(role => {
      const cfg = ROLE_LABELS[role] || { label: role, color: '#9e9e9e' }
      return (
        <span key={role} className="role-badge" style={{ background: cfg.color }}>
          {cfg.label}
        </span>
      )
    })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">M</div>
          <span>多语言CMS</span>
        </div>
        <ul className="sidebar-menu">
          {visibleMenu.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => isActive ? 'active' : ''}
              >
                <span className="menu-icon">{item.icon}</span>
                <span className="menu-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left"></div>
          <div className="top-bar-right">
            {currentUser && (
              <div className="user-info">
                <div className="user-avatar">{currentUser.avatar || '👤'}</div>
                <div className="user-details">
                  <div className="user-name">
                    {currentUser.full_name || currentUser.username}
                    {getUserRoleBadges()}
                  </div>
                  <div className="user-email">{currentUser.email}</div>
                </div>
                <button className="btn btn-outline btn-sm logout-btn" onClick={logout}>
                  退出
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
      <LoginModal />
    </div>
  )
}
