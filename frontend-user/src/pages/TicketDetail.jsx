import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Descriptions, Tag, Steps, Button, Input, Space, Typography,
  message, Modal, Rate, Spin, Divider, Avatar, Tooltip, Row, Col,
} from 'antd'
import {
  UserOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  StarOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons'
import { getTicketDetail, sendMessage, rateTicket, closeTicket, reopenTicket } from '../api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

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

const stepMap = {
  pending: 0,
  in_progress: 1,
  resolved: 2,
  closed: 3,
}

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msgContent, setMsgContent] = useState('')
  const [sending, setSending] = useState(false)
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [rateScore, setRateScore] = useState(5)
  const [rateComment, setRateComment] = useState('')
  const [rating, setRating] = useState(false)
  const messagesEndRef = useRef(null)

  const fetchTicket = async () => {
    setLoading(true)
    try {
      const res = await getTicketDetail(id)
      setTicket(res.data)
    } catch (err) {
      message.error('获取工单详情失败')
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTicket()
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.messages])

  const handleSendMessage = async () => {
    if (!msgContent.trim()) return
    setSending(true)
    try {
      await sendMessage(id, { content: msgContent.trim() })
      setMsgContent('')
      await fetchTicket()
    } catch (err) {
      message.error(err.response?.data?.detail || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleClose = async () => {
    try {
      await closeTicket(id)
      message.success('工单已关闭')
      await fetchTicket()
    } catch (err) {
      message.error(err.response?.data?.detail || '操作失败')
    }
  }

  const handleReopen = async () => {
    try {
      await reopenTicket(id)
      message.success('工单已重新开启')
      await fetchTicket()
    } catch (err) {
      message.error(err.response?.data?.detail || '操作失败')
    }
  }

  const handleRate = async () => {
    if (rateScore < 1) {
      message.warning('请选择评分')
      return
    }
    setRating(true)
    try {
      await rateTicket(id, { score: rateScore, comment: rateComment || null })
      message.success('评价成功')
      setRateModalOpen(false)
      await fetchTicket()
    } catch (err) {
      message.error(err.response?.data?.detail || '评价失败')
    } finally {
      setRating(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  if (!ticket) return null

  const statusCfg = statusConfig[ticket.status] || { color: 'default', label: ticket.status }
  const priorityCfg = priorityConfig[ticket.priority] || { color: 'default', label: ticket.priority }
  const canRate = (ticket.status === 'resolved' || ticket.status === 'closed') && !ticket.rating
  const canClose = ticket.status === 'resolved'
  const canReopen = ticket.status === 'resolved'

  return (
    <div>
      <Steps
        current={stepMap[ticket.status] ?? 0}
        style={{ marginBottom: 24 }}
        items={[
          { title: '待处理', icon: <CustomerServiceOutlined /> },
          { title: '处理中' },
          { title: '已解决', icon: <CheckCircleOutlined /> },
          { title: '已关闭', icon: <CloseCircleOutlined /> },
        ]}
      />

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              #{ticket.id} {ticket.title}
            </Title>
          </Col>
          <Col>
            <Space>
              <Tag color={statusCfg.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                {statusCfg.label}
              </Tag>
              <Tag color={priorityCfg.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                {priorityCfg.label}优先级
              </Tag>
            </Space>
          </Col>
        </Row>
        <Descriptions style={{ marginTop: 16 }} column={3} size="small">
          <Descriptions.Item label="分类">{ticket.category}</Descriptions.Item>
          <Descriptions.Item label="提交人">{ticket.user?.username || '-'}</Descriptions.Item>
          <Descriptions.Item label="处理人">{ticket.agent?.username || '暂未分配'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(ticket.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{new Date(ticket.updated_at).toLocaleString('zh-CN')}</Descriptions.Item>
          {ticket.closed_at && (
            <Descriptions.Item label="关闭时间">{new Date(ticket.closed_at).toLocaleString('zh-CN')}</Descriptions.Item>
          )}
        </Descriptions>
        <Divider style={{ margin: '12px 0' }} />
        <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ticket.description}</Paragraph>
      </Card>

      {ticket.rating && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <StarOutlined style={{ color: '#faad14' }} />
            <Text strong>我的评价：</Text>
            <Rate disabled value={ticket.rating.score} />
            <Text type="secondary">{ticket.rating.score} 分</Text>
            {ticket.rating.comment && <Text type="secondary">- {ticket.rating.comment}</Text>}
          </Space>
        </Card>
      )}

      <Card
        title={<Space><SendOutlined /> 沟通记录</Space>}
        extra={
          <Space>
            {canReopen && (
              <Button size="small" onClick={handleReopen}>重新开启</Button>
            )}
            {canClose && (
              <Button size="small" type="primary" danger onClick={handleClose}>关闭工单</Button>
            )}
            {canRate && (
              <Button size="small" type="primary" icon={<StarOutlined />} onClick={() => setRateModalOpen(true)}>
                评价工单
              </Button>
            )}
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchTicket}>刷新</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
          {(!ticket.messages || ticket.messages.length === 0) && (
            <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>暂无消息</div>
          )}
          {ticket.messages?.map((msg) => {
            const isUser = msg.sender_id === ticket.user_id
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  maxWidth: '75%',
                  gap: 8,
                }}>
                  <Avatar
                    size="small"
                    icon={<UserOutlined />}
                    style={{
                      backgroundColor: isUser ? '#1677ff' : '#52c41a',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{
                      fontSize: 12,
                      color: '#999',
                      marginBottom: 4,
                      textAlign: isUser ? 'right' : 'left',
                    }}>
                      <Tooltip title={new Date(msg.created_at).toLocaleString('zh-CN')}>
                        <span>{msg.sender?.username || '未知'} · {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </Tooltip>
                    </div>
                    <div style={{
                      background: isUser ? '#1677ff' : '#f0f0f0',
                      color: isUser ? '#fff' : '#333',
                      padding: '8px 14px',
                      borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <TextArea
            value={msgContent}
            onChange={(e) => setMsgContent(e.target.value)}
            placeholder="输入消息内容..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sending}
            onClick={handleSendMessage}
            style={{ alignSelf: 'flex-end' }}
          >
            发送
          </Button>
        </div>
      </Card>

      <Modal
        title="评价工单"
        open={rateModalOpen}
        onOk={handleRate}
        onCancel={() => setRateModalOpen(false)}
        confirmLoading={rating}
        okText="提交评价"
        cancelText="取消"
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Text>请为本次服务评分：</Text>
          <div style={{ marginTop: 8 }}>
            <Rate value={rateScore} onChange={setRateScore} style={{ fontSize: 36 }} />
          </div>
        </div>
        <TextArea
          value={rateComment}
          onChange={(e) => setRateComment(e.target.value)}
          placeholder="请输入您的评价（选填）"
          rows={4}
        />
      </Modal>
    </div>
  )
}
