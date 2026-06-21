import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  const menuItems = [
    { path: '/', label: '仪表盘', icon: '📊' },
    { path: '/content-types', label: '内容类型', icon: '📋' },
  ]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">M</div>
          <span>多语言CMS</span>
        </div>
        <ul className="sidebar-menu">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => isActive ? 'active' : ''}
              >
                {item.icon} {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
