import { useEffect, useState } from 'react';
import { Table, Tag, Button, message, Space, Spin, Tooltip } from 'antd';
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

const slaStatusConfig = {
  on_track: { color: 'green', label: '正常' },
  response_warning: { color: 'orange', label: '响应预警' },
  response_breached: { color: 'red', label: '响应超时' },
  resolution_warning: { color: 'orange', label: '解决预警' },
  resolution_breached: { color: 'red', label: '解决超时' },
  resolved: { color: 'default', label: '已完成' },
};

function formatRemainingMinutes(minutes) {
  if (minutes == null) return '-';
  if (minutes <= 0) return '已超时';
  const absMin = Math.abs(minutes);
  if (absMin >= 1440) {
    const days = Math.floor(absMin / 1440);
    const hrs = Math.floor((absMin % 1440) / 60);
    return `${days}天${hrs > 0 ? hrs + '小时' : ''}`;
  }
  if (absMin >= 60) {
    const hrs = Math.floor(absMin / 60);
    const mins = Math.floor(absMin % 60);
    return `${hrs}小时${mins > 0 ? mins + '分' : ''}`;
  }
  return `${Math.round(absMin)}分钟`;
}

function renderSLAColumn(ticket) {
  const sla = ticket.sla;
  if (!sla) {
    return <Tag color="default">-</Tag>;
  }
  const cfg = slaStatusConfig[sla.sla_status] || { color: 'default', label: sla.sla_status };
  const remaining = sla.response_remaining_minutes != null
    ? sla.response_remaining_minutes
    : sla.resolution_remaining_minutes;
  const remainingText = formatRemainingMinutes(remaining);
  const deadline = sla.response_deadline || sla.resolution_deadline;

  return (
    <Tooltip
      title={
        <div>
          <div>状态：{cfg.label}</div>
          {sla.response_deadline && (
            <div>响应截止：{dayjs(sla.response_deadline).format('YYYY-MM-DD HH:mm')}</div>
          )}
          {sla.resolution_deadline && (
            <div>解决截止：{dayjs(sla.resolution_deadline).format('YYYY-MM-DD HH:mm')}</div>
          )}
          {sla.response_remaining_minutes != null && (
            <div>响应剩余：{formatRemainingMinutes(sla.response_remaining_minutes)}</div>
          )}
          {sla.resolution_remaining_minutes != null && (
            <div>解决剩余：{formatRemainingMinutes(sla.resolution_remaining_minutes)}</div>
          )}
        </div>
      }
    >
      <Space>
        <Tag color={cfg.color}>{cfg.label}</Tag>
        <span style={{ fontSize: 12, color: cfg.color === 'red' ? '#ff4d4f' : cfg.color === 'orange' ? '#fa8c16' : '#52c41a' }}>
          {remainingText}
        </span>
      </Space>
    </Tooltip>
  );
}

export default function PendingTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadTickets();
    const timer = setInterval(loadTickets, 60000);
    return () => clearInterval(timer);
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
      title: 'SLA状态',
      width: 160,
      render: (_, record) => renderSLAColumn(record),
      sorter: (a, b) => {
        const aRem = a.sla?.response_remaining_minutes ?? a.sla?.resolution_remaining_minutes ?? 999999;
        const bRem = b.sla?.response_remaining_minutes ?? b.sla?.resolution_remaining_minutes ?? 999999;
        return aRem - bRem;
      },
      defaultSortOrder: 'ascend',
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
