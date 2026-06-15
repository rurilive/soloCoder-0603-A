import React, { useState, useEffect } from 'react';
import { Layout, Menu, Badge, notification } from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SettingOutlined,
  PlusCircleOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  AuditOutlined
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
import ContentDetail from './components/ContentDetail';
import { statsAPI, samplingAPI } from './services/api';

const { Header, Sider, Content } = Layout;

function App() {
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
      // ignore
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPendingSamples();
    const interval = setInterval(() => {
      fetchStats();
      fetchPendingSamples();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'content_update' || data.type === 'content_reviewed') {
          fetchStats();
          if (data.type === 'content_reviewed') {
            notification.success({
              message: '内容已审核',
              description: `「${data.data.title}」已被${data.data.reviewer}${data.data.status === 'approved' ? '通过' : '拒绝'}`,
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
          }
        }
      } catch (e) {
        console.error('WebSocket消息解析失败:', e);
      }
    };

    return () => ws.close();
  }, []);

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
    }
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
          <span style={{ color: '#666' }}>
            {dayjs().format('YYYY年MM月DD日 HH:mm:ss')}
          </span>
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
            <Route path="/content/:id" element={<ContentDetail />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
