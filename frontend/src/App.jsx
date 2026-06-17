import React, { useState, useEffect } from 'react';
import {
  Layout, Menu, Badge, notification, Modal, Form, Input, Button,
  Dropdown, Avatar, Space, Tag, message
} from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SettingOutlined,
  PlusCircleOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  AuditOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import QueuePage from './pages/QueuePage';
import ApprovedPage from './pages/ApprovedPage';
import RejectedPage from './pages/RejectedPage';
import RulesPage from './pages/RulesPage';
import SubmitPage from './pages/SubmitPage';
import DashboardPage from './pages/DashboardPage';
import MLThresholdPage from './pages/MLThresholdPage';
import SampleReviewPage from './pages/SampleReviewPage';
import ReviewerPerformancePage from './pages/ReviewerPerformancePage';
import ContentDetail from './components/ContentDetail';
import { statsAPI, samplingAPI } from './services/api';
import { AuthProvider, useAuth } from './context/AuthContext';

const { Header, Sider, Content } = Layout;

const defaultAccounts = [
  { username: 'admin', password: 'admin123', role: '管理员' },
  { username: 'reviewer1', password: '123456', role: '审核员张' },
  { username: 'reviewer2', password: '123456', role: '审核员李' },
  { username: 'reviewer3', password: '123456', role: '审核员王' }
];

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0
  });
  const [pendingSamples, setPendingSamples] = useState(0);
  const [loginForm] = Form.useForm();

  const {
    currentUser,
    isAdmin,
    loginModalVisible,
    setLoginModalVisible,
    loginLoading,
    handleLogin,
    handleLogout
  } = useAuth();

  const fetchStats = async () => {
    try {
      const res = await statsAPI.get();
      setStats(res.data);
    } catch (err) {
      console.error('获取统计失败:', err);
    }
  };

  const fetchPendingSamples = async () => {
    try {
      const res = await samplingAPI.pendingReviews();
      setPendingSamples(res.data?.length || 0);
    } catch (err) {
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchStats();
    fetchPendingSamples();
    const interval = setInterval(() => {
      fetchStats();
      fetchPendingSamples();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'content_update' || data.type === 'content_reviewed' || data.type === 'batch_reviewed') {
          fetchStats();
          if (data.type === 'content_reviewed') {
            notification.success({
              message: '内容已审核',
              description: `「${data.data.title}」已被${data.data.reviewer}${data.data.status === 'approved' ? '通过' : '拒绝'}`,
              placement: 'topRight'
            });
          } else if (data.type === 'batch_reviewed') {
            notification.success({
              message: '批量审核完成',
              description: `${data.data.reviewer} 已${data.data.action === 'approve' ? '通过' : '拒绝'} ${data.data.count} 条内容`,
              placement: 'topRight'
            });
          } else if (data.type === 'content_update') {
            const statusText = {
              pending: '进入人工审核队列',
              approved: '自动审核通过',
              rejected: '自动审核拒绝'
            };
            notification.info({
              message: '新内容提交',
              description: `「${data.data.title}」${statusText[data.data.status] || '已提交'}`,
              placement: 'topRight'
            });
          } else if (data.type === 'tasks_assigned') {
            notification.info({
              message: '任务已分配',
              description: `有 ${data.data.count} 条内容分配给了 ${data.data.assigned_to}`,
              placement: 'topRight'
            });
          }
        }
      } catch (e) {
        console.error('WebSocket消息解析失败:', e);
      }
    };

    return () => ws.close();
  }, []);

  const onLoginSubmit = async (values) => {
    const result = await handleLogin(values);
    if (result.success) {
      loginForm.resetFields();
      message.success(`欢迎回来，${result.user.display_name || result.user.username}！`);
    } else {
      message.error(result.message);
    }
  };

  const onLogout = () => {
    handleLogout();
    message.info('已退出登录');
  };

  const userMenuItems = [
    {
      key: 'role',
      label: (
        <Space>
          <Tag color={isAdmin ? 'purple' : 'blue'} icon={isAdmin ? <SafetyCertificateOutlined /> : <UserOutlined />}>
            {isAdmin ? '管理员' : '审核员'}
          </Tag>
        </Space>
      ),
      disabled: true
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout
    }
  ];

  const menuItems = [
    {
      key: '/dashboard',
      icon: <BarChartOutlined />,
      label: '数据概览'
    },
    {
      key: '/queue',
      icon: <InboxOutlined />,
      label: (
        <span>
          待审队列
          {stats.pending > 0 && (
            <Badge count={stats.pending} size="small" style={{ marginLeft: 8 }} />
          )}
        </span>
      )
    },
    {
      key: '/approved',
      icon: <CheckCircleOutlined />,
      label: (
        <span>
          已通过
          <span style={{ marginLeft: 8, color: '#52c41a' }}>({stats.approved})</span>
        </span>
      )
    },
    {
      key: '/rejected',
      icon: <CloseCircleOutlined />,
      label: (
        <span>
          已拒绝
          <span style={{ marginLeft: 8, color: '#ff4d4f' }}>({stats.rejected})</span>
        </span>
      )
    },
    {
      key: '/submit',
      icon: <PlusCircleOutlined />,
      label: '提交内容'
    },
    {
      key: '/rules',
      icon: <SettingOutlined />,
      label: '审核规则'
    },
    {
      key: '/ml-threshold',
      icon: <ExperimentOutlined />,
      label: 'ML模型阈值'
    },
    {
      key: '/sample-review',
      icon: <AuditOutlined />,
      label: (
        <span>
          抽样复审
          {pendingSamples > 0 && (
            <Badge count={pendingSamples} size="small" style={{ marginLeft: 8 }} />
          )}
        </span>
      )
    },
    ...(isAdmin ? [{
      key: '/performance',
      icon: <TrophyOutlined />,
      label: '审核员绩效'
    }] : [])
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: collapsed ? 12 : 18,
          fontWeight: 'bold',
          background: '#001529'
        }}>
          {collapsed ? '审核' : '内容审核系统'}
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
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
          <h2 style={{ margin: 0 }}>
            {menuItems.find(m => m.key === location.pathname)?.label?.props?.children ||
             menuItems.find(m => m.key === location.pathname)?.label ||
             '内容审核系统'}
          </h2>
          <Space>
            <span style={{ color: '#666' }}>
              {dayjs().format('YYYY年MM月DD日 HH:mm:ss')}
            </span>
            {currentUser && (
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: isAdmin ? '#722ed1' : '#1677ff' }} />
                  <span style={{ color: '#333' }}>
                    {currentUser.display_name || currentUser.username}
                  </span>
                </Space>
              </Dropdown>
            )}
          </Space>
        </Header>
        <Content style={{ margin: '24px', padding: 24, background: '#fff', minHeight: 'auto' }}>
          <Routes>
            <Route path="/" element={<QueuePage />} />
            <Route path="/dashboard" element={<DashboardPage stats={stats} />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/approved" element={<ApprovedPage />} />
            <Route path="/rejected" element={<RejectedPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/ml-threshold" element={<MLThresholdPage />} />
            <Route path="/sample-review" element={<SampleReviewPage />} />
            <Route path="/performance" element={<ReviewerPerformancePage />} />
            <Route path="/content/:id" element={<ContentDetail />} />
          </Routes>
        </Content>
      </Layout>

      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
            登录内容审核系统
          </Space>
        }
        open={loginModalVisible}
        footer={null}
        closable={false}
        maskClosable={false}
        width={420}
        destroyOnClose
      >
        <Form
          form={loginForm}
          layout="vertical"
          onFinish={onLoginSubmit}
          initialValues={{ username: '', password: '' }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              size="large"
              block
              htmlType="submit"
              loading={loginLoading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 20, padding: 12, background: '#f6f8fa', borderRadius: 6 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
            <strong>测试账号：</strong>
          </div>
          {defaultAccounts.map(acc => (
            <div key={acc.username} style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
              <Tag color={acc.role === '管理员' ? 'purple' : 'blue'} style={{ marginRight: 8 }}>
                {acc.role}
              </Tag>
              <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 3 }}>{acc.username}</code>
              <span style={{ color: '#999' }}> / {acc.password}</span>
            </div>
          ))}
        </div>
      </Modal>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
