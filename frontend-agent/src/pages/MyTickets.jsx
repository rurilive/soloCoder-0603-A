import { useEffect, useState } from 'react';
import { Table, Tag, Button, Select, Space, message, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { getTickets } from '../api';

const statusColors = {
  pending: 'orange',
  in_progress: 'blue',
  resolved: 'green',
  closed: 'default',
};

const statusLabels = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

const priorityColors = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  urgent: 'red',
};

const priorityLabels = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('in_progress');
  const navigate = useNavigate();

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (statusFilter) {
        params.status = statusFilter;
      }
      const res = await getTickets(params);
      setTickets(res.data);
    } catch {
      message.error('加载工单列表失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => (
        <Tag color={statusColors[val]}>{statusLabels[val] || val}</Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (val) => (
        <Tag color={priorityColors[val]}>{priorityLabels[val] || val}</Tag>
      ),
    },
    {
      title: '用户',
      width: 120,
      render: (_, record) => record.user?.username || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button size="small" onClick={() => navigate(`/ticket/${record.id}`)}>
          处理
        </Button>
      ),
    },
  ];

  if (loading && tickets.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>状态筛选：</span>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 160 }}
          options={[
            { value: '', label: '全部' },
            { value: 'pending', label: '待处理' },
            { value: 'in_progress', label: '处理中' },
            { value: 'resolved', label: '已解决' },
            { value: 'closed', label: '已关闭' },
          ]}
        />
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={tickets}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </div>
  );
}
