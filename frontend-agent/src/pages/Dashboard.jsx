import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, message } from 'antd';
import {
  TeamOutlined,
  InboxOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { getTicketStats } from '../api';

const statusConfig = {
  pending: { label: '待处理', color: '#fa8c16', icon: <InboxOutlined /> },
  in_progress: { label: '处理中', color: '#1677ff', icon: <SyncOutlined /> },
  resolved: { label: '已解决', color: '#52c41a', icon: <CheckCircleOutlined /> },
  closed: { label: '已关闭', color: '#8c8c8c', icon: <StopOutlined /> },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await getTicketStats();
      setStats(res.data);
    } catch {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const byStatus = stats?.by_status || {};

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总工单数"
              value={stats?.total || 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Col xs={24} sm={12} md={6} key={key}>
            <Card>
              <Statistic
                title={cfg.label}
                value={byStatus[key] || 0}
                prefix={cfg.icon}
                valueStyle={{ color: cfg.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
