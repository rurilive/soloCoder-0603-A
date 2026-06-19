import { Layout, Menu, theme } from 'antd'
import { UserOutlined, TeamOutlined } from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import PersonalDashboard from './pages/PersonalDashboard'
import TeamDashboard from './pages/TeamDashboard'

const { Header, Sider, Content } = Layout

const App: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/personal',
      icon: <UserOutlined />,
      label: '个人绩效',
    },
    {
      key: '/team',
      icon: <TeamOutlined />,
      label: '团队统计',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible defaultCollapsed={false}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 18,
            fontWeight: 'bold',
            background: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          客服看板
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} />
        <Content
          style={{
            margin: '24px 24px 24px 24px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Routes>
            <Route path="/" element={<PersonalDashboard />} />
            <Route path="/personal" element={<PersonalDashboard />} />
            <Route path="/team" element={<TeamDashboard />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
