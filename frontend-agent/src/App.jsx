import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme } from 'antd';
import {
  DashboardOutlined,
  InboxOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PendingTickets from './pages/PendingTickets';
import MyTickets from './pages/MyTickets';
import TicketDetail from './pages/TicketDetail';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/pending', icon: <InboxOutlined />, label: '待处理工单' },
  { key: '/my-tickets', icon: <UserOutlined />, label: '我的工单' },
];

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token: themeToken } = theme.useToken();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const currentMenuKey = ['/' + location.pathname.split('/')[1]].includes('/ticket')
    ? '/my-tickets'
    : location.pathname;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout style={{ minHeight: '100vh' }}>
              <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                style={{ background: themeToken.colorBgContainer }}
              >
                <div
                  style={{
                    height: 32,
                    margin: 16,
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: collapsed ? 14 : 16,
                    color: themeToken.colorPrimary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {collapsed ? '客服' : '客服工单管理'}
                </div>
                <Menu
                  mode="inline"
                  selectedKeys={[currentMenuKey]}
                  items={menuItems}
                  onClick={({ key }) => navigate(key)}
                />
              </Sider>
              <Layout>
                <Header
                  style={{
                    padding: '0 24px',
                    background: themeToken.colorBgContainer,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 600 }}>客服工单管理</span>
                  <Button
                    type="text"
                    icon={<LogoutOutlined />}
                    onClick={handleLogout}
                  >
                    退出登录
                  </Button>
                </Header>
                <Content style={{ margin: 24 }}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/pending" element={<PendingTickets />} />
                    <Route path="/my-tickets" element={<MyTickets />} />
                    <Route path="/ticket/:id" element={<TicketDetail />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Content>
              </Layout>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
