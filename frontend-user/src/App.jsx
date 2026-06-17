import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Typography, theme } from 'antd'
import {
  FileTextOutlined,
  PlusOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import PrivateRoute from './components/PrivateRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import MyTickets from './pages/MyTickets'
import SubmitTicket from './pages/SubmitTicket'
import TicketDetail from './pages/TicketDetail'

const { Header, Sider, Content } = Layout
const { Title } = Typography

const siderStyle = {
  overflow: 'auto',
  height: '100vh',
  position: 'fixed',
  left: 0,
  top: 0,
  bottom: 0,
  zIndex: 10,
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken()

  const menuItems = [
    {
      key: '/',
      icon: <FileTextOutlined />,
      label: '我的工单',
    },
    {
      key: '/submit',
      icon: <PlusOutlined />,
      label: '提交工单',
    },
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const selectedKey = location.pathname.startsWith('/ticket/') ? '/' : location.pathname

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        style={siderStyle}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
            {collapsed ? '工' : '工单系统'}
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Title level={4} style={{ margin: 0 }}>工单系统 - 用户端</Title>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Header>
        <Content style={{
          margin: 24,
          padding: 24,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          minHeight: 280,
        }}>
          <Routes>
            <Route path="/" element={<MyTickets />} />
            <Route path="/submit" element={<SubmitTicket />} />
            <Route path="/ticket/:id" element={<TicketDetail />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/*" element={
        <PrivateRoute>
          <AppLayout />
        </PrivateRoute>
      } />
    </Routes>
  )
}
