import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Button, Select, Space, Typography, message, Tooltip } from 'antd'
import { EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { getMyTickets } from '../api'

const { Title } = Typography

const statusConfig = {
  pending: { color: 'default', label: '待处理' },
  in_progress: { color: 'processing', label: '处理中' },
  resolved: { color: 'success', label: '已解决' },
  closed: { color: 'default', label: '已关闭' },
}

const priorityConfig = {
  low: { color: 'default', label: '低' },
  medium: { color: 'blue', label: '中' },
  high: { color: 'orange', label: '高' },
  urgent: { color: 'red', label: '紧急' },
}

const slaStatusConfig = {
  on_track: { color: 'green', label: '正常' },
  response_warning: { color: 'orange', label: '响应预警' },
  response_breached: { color: 'red', label: '响应超时' },
  resolution_warning: { color: 'orange', label: '解决预警' },
  resolution_breached: { color: 'red', label: '解决超时' },
  resolved: { color: 'default', label: '已完成' },
}

function formatRemainingMinutes(minutes) {
  if (minutes == null) return '-'
  if (minutes <= 0) return '已超时'
  const absMin = Math.abs(minutes)
  if (absMin >= 1440) {
    const days = Math.floor(absMin / 1440)
    const hrs = Math.floor((absMin % 1440) / 60)
    return `${days}天${hrs > 0 ? hrs + '小时' : ''}`
  }
  if (absMin >= 60) {
    const hrs = Math.floor(absMin / 60)
    const mins = Math.floor(absMin % 60)
    return `${hrs}小时${mins > 0 ? mins + '分' : ''}`
  }
  return `${Math.round(absMin)}分钟`
}

function formatDate(val) {
  if (!val) return '-'
  const d = new Date(val)
  return d.toLocaleString('zh-CN')
}

function renderSLAColumn(ticket) {
  const sla = ticket.sla
  if (!sla) {
    return <Tag color="default">-</Tag>
  }
  const cfg = slaStatusConfig[sla.sla_status] || { color: 'default', label: sla.sla_status }
  const remaining = sla.response_remaining_minutes != null
    ? sla.response_remaining_minutes
    : sla.resolution_remaining_minutes
  const remainingText = formatRemainingMinutes(remaining)

  return (
    <Tooltip
      title={
        <div>
          <div>状态：{cfg.label}</div>
          {sla.response_deadline && (
            <div>响应截止：{formatDate(sla.response_deadline)}</div>
          )}
          {sla.resolution_deadline && (
            <div>解决截止：{formatDate(sla.resolution_deadline)}</div>
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
  )
}

export default function MyTickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState(null)
  const navigate = useNavigate()

  const fetchTickets = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const res = await getMyTickets(params)
      setTickets(res.data)
    } catch (err) {
      message.error('获取工单列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickets()
    const timer = setInterval(fetchTickets, 60000)
    return () => clearInterval(timer)
  }, [statusFilter])

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const cfg = statusConfig[status] || { color: 'default', label: status }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (priority) => {
        const cfg = priorityConfig[priority] || { color: 'default', label: priority }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'SLA状态',
      key: 'sla',
      width: 160,
      render: (_, record) => renderSLAColumn(record),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (val) => val ? new Date(val).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/ticket/${record.id}`)
          }}
        >
          查看
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>我的工单</Title>
        <Space>
          <span>状态筛选：</span>
          <Select
            allowClear
            placeholder="全部状态"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val || null)}
          >
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <Select.Option key={key} value={key}>{cfg.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchTickets}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/submit')}>
            提交工单
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={tickets}
        loading={loading}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/ticket/${record.id}`),
        })}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
    </div>
  )
}
