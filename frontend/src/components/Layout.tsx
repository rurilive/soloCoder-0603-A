import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: '仪表盘', icon: '📊' },
  { path: '/visual-config', label: '可视化配置', icon: '🎛️' },
  { path: '/scripts', label: '脚本管理', icon: '📝' },
  { path: '/debug', label: '脚本调试', icon: '🐛' },
  { path: '/tasks', label: '任务管理', icon: '⏰' },
  { path: '/results', label: '执行结果', icon: '📋' },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">爬虫平台</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'active' : ''}`
              }
              end={item.path === '/'}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
