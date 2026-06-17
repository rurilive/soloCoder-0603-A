import { useEffect, useState } from 'react';
import { Table, Tag, Button, message, Space, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { getTickets, acceptTicket } from '../api';

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

export default function PendingTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await getTickets({ status: 'pending', size: 100 });
      setTickets(res.data);
    } catch {
      message.error('加载工单列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id) => {
    setAcceptingId(id);
    try {
      await acceptTicket(id);
      message.success('接单成功');
      loadTickets();
    } catch (err) {
      message.error(err.response?.data?.detail || '接单失败');
    } finally {
      setAcceptingId(null);
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
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (val) => (
        <Tag color={priorityColors[val]}>{priorityLabels[val] || val}</Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
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
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            loading={acceptingId === record.id}
            onClick={() => handleAccept(record.id)}
          >
            接单
          </Button>
          <Button size="small" onClick={() => navigate(`/ticket/${record.id}`)}>
            查看
          </Button>
        </Space>
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
