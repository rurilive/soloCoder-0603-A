import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Input,
  Checkbox,
  Divider,
  Spin,
  message,
  Modal,
  Select,
  Rate,
  Empty,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  ArrowUpOutlined,
  SwapOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getTicketDetail,
  acceptTicket,
  resolveTicket,
  escalateTicket,
  transferTicket,
  sendMessage,
  getAgents,
} from '../api';

const { TextArea } = Input;

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

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState([]);
  const messagesEndRef = useRef(null);

  const [escalateVisible, setEscalateVisible] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateTarget, setEscalateTarget] = useState(null);
  const [escalateLoading, setEscalateLoading] = useState(false);

  const [transferVisible, setTransferVisible] = useState(false);
  const [transferReason, setTransferReason] = useState('');
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    loadTicket();
    loadAgents();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [ticket?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadTicket = async () => {
    setLoading(true);
    try {
      const res = await getTicketDetail(id);
      setTicket(res.data);
    } catch {
      message.error('加载工单失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const res = await getAgents();
      setAgents(res.data || []);
    } catch {
      setAgents([]);
    }
  };

  const handleAccept = async () => {
    try {
      await acceptTicket(id);
      message.success('接单成功');
      loadTicket();
    } catch (err) {
      message.error(err.response?.data?.detail || '接单失败');
    }
  };

  const handleResolve = async () => {
    try {
      await resolveTicket(id);
      message.success('工单已解决');
      loadTicket();
    } catch (err) {
      message.error(err.response?.data?.detail || '操作失败');
    }
  };

  const handleSend = async () => {
    if (!msgText.trim()) return;
    setSending(true);
    try {
      await sendMessage(id, { content: msgText.trim(), is_internal: isInternal });
      setMsgText('');
      setIsInternal(false);
      loadTicket();
    } catch (err) {
      message.error(err.response?.data?.detail || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    if (!escalateReason.trim()) {
      message.warning('请填写升级原因');
      return;
    }
    setEscalateLoading(true);
    try {
      await escalateTicket(id, {
        action_type: 'escalate',
        reason: escalateReason.trim(),
        to_user_id: escalateTarget || undefined,
      });
      message.success('工单已升级');
      setEscalateVisible(false);
      setEscalateReason('');
      setEscalateTarget(null);
      loadTicket();
    } catch (err) {
      message.error(err.response?.data?.detail || '升级失败');
    } finally {
      setEscalateLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) {
      message.warning('请选择目标客服');
      return;
    }
    if (!transferReason.trim()) {
      message.warning('请填写转交原因');
      return;
    }
    setTransferLoading(true);
    try {
      await transferTicket(id, {
        action_type: 'transfer',
        to_user_id: transferTarget,
        reason: transferReason.trim(),
      });
      message.success('工单已转交');
      setTransferVisible(false);
      setTransferReason('');
      setTransferTarget(null);
      loadTicket();
    } catch (err) {
      message.error(err.response?.data?.detail || '转交失败');
    } finally {
      setTransferLoading(false);
    }
  };

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  })();

  if (loading && !ticket) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!ticket) {
    return <Empty description="工单不存在" />;
  }

  const agentOptions = agents
    .filter((a) => a.id !== currentUser?.id)
    .map((a) => ({ value: a.id, label: a.username }));

  return (
    <div>
      <Card
        title={
          <Space>
            <span>工单 #{ticket.id}</span>
            <Tag color={statusColors[ticket.status]}>
              {statusLabels[ticket.status]}
            </Tag>
            <Tag color={priorityColors[ticket.priority]}>
              {priorityLabels[ticket.priority]}
            </Tag>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="标题">{ticket.title}</Descriptions.Item>
          <Descriptions.Item label="分类">{ticket.category}</Descriptions.Item>
          <Descriptions.Item label="用户">
            {ticket.user?.username || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="处理客服">
            {ticket.agent?.username || '未分配'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(ticket.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {dayjs(ticket.updated_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {ticket.sla && (
            <>
              <Descriptions.Item label="SLA状态">
                <Space>
                  <Tag color={slaStatusConfig[ticket.sla.sla_status]?.color || 'default'}>
                    {slaStatusConfig[ticket.sla.sla_status]?.label || ticket.sla.sla_status}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="响应截止时间">
                {ticket.sla.response_deadline
                  ? dayjs(ticket.sla.response_deadline).format('YYYY-MM-DD HH:mm')
                  : '-'}
                {ticket.sla.response_remaining_minutes != null && (
                  <div style={{ fontSize: 12, color: ticket.sla.response_remaining_minutes <= 0 ? '#ff4d4f' : '#666' }}>
                    剩余：{formatRemainingMinutes(ticket.sla.response_remaining_minutes)}
                  </div>
                )}
                {ticket.sla.first_response_at && (
                  <div style={{ fontSize: 12, color: '#52c41a' }}>
                    已响应：{dayjs(ticket.sla.first_response_at).format('HH:mm')}
                  </div>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="解决截止时间">
                {ticket.sla.resolution_deadline
                  ? dayjs(ticket.sla.resolution_deadline).format('YYYY-MM-DD HH:mm')
                  : '-'}
                {ticket.sla.resolution_remaining_minutes != null && (
                  <div style={{ fontSize: 12, color: ticket.sla.resolution_remaining_minutes <= 0 ? '#ff4d4f' : '#666' }}>
                    剩余：{formatRemainingMinutes(ticket.sla.resolution_remaining_minutes)}
                  </div>
                )}
                {ticket.sla.resolved_at && (
                  <div style={{ fontSize: 12, color: '#52c41a' }}>
                    已解决：{dayjs(ticket.sla.resolved_at).format('HH:mm')}
                  </div>
                )}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="描述" span={3}>
            {ticket.description}
          </Descriptions.Item>
        </Descriptions>
        {ticket.rating && (
          <>
            <Divider orientation="left">用户评价</Divider>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Rate disabled value={ticket.rating.score} />
              <span style={{ color: '#999' }}>
                {dayjs(ticket.rating.created_at).format('YYYY-MM-DD HH:mm')}
              </span>
            </div>
            {ticket.rating.comment && (
              <div style={{ marginTop: 8, color: '#555' }}>
                {ticket.rating.comment}
              </div>
            )}
          </>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card
            title="消息记录"
            bodyStyle={{ padding: 0 }}
            style={{ marginBottom: 16 }}
          >
            <div
              style={{
                maxHeight: 420,
                overflowY: 'auto',
                padding: 16,
              }}
            >
              {ticket.messages && ticket.messages.length > 0 ? (
                ticket.messages.map((msg) => {
                  const isMe = msg.sender_id === currentUser?.id;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: msg.is_internal
                            ? '#fffbe6'
                            : isMe
                            ? '#e6f4ff'
                            : '#f5f5f5',
                          border: msg.is_internal ? '1px solid #ffe58f' : '1px solid #f0f0f0',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 4,
                            fontSize: 12,
                            color: '#999',
                          }}
                        >
                          <UserOutlined />
                          <span>{msg.sender?.username || `用户${msg.sender_id}`}</span>
                          <span>{dayjs(msg.created_at).format('HH:mm')}</span>
                          {msg.is_internal && (
                            <Tag color="warning" style={{ marginLeft: 4, fontSize: 11 }}>
                              内部备注
                            </Tag>
                          )}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              <div ref={messagesEndRef} />
            </div>
          </Card>

          <Card bodyStyle={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <TextArea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="输入消息内容..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ flex: 1 }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Checkbox
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                >
                  内部备注
                </Checkbox>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={sending}
                  onClick={handleSend}
                >
                  发送
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card
          title="操作"
          style={{ width: 220, flexShrink: 0 }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {ticket.status === 'pending' && (
            <Button type="primary" block onClick={handleAccept}>
              接单
            </Button>
          )}
          {ticket.status === 'in_progress' && (
            <>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                block
                onClick={handleResolve}
              >
                解决
              </Button>
              <Tooltip title="升级工单优先级">
                <Button
                  icon={<ArrowUpOutlined />}
                  block
                  onClick={() => setEscalateVisible(true)}
                >
                  升级
                </Button>
              </Tooltip>
              <Button
                icon={<SwapOutlined />}
                block
                onClick={() => setTransferVisible(true)}
              >
                转交
              </Button>
            </>
          )}
          {(ticket.status === 'resolved' || ticket.status === 'closed') && (
            <Button block onClick={() => navigate('/my-tickets')}>
              返回我的工单
            </Button>
          )}
        </Card>
      </div>

      <Modal
        title="升级工单"
        open={escalateVisible}
        onOk={handleEscalate}
        onCancel={() => {
          setEscalateVisible(false);
          setEscalateReason('');
          setEscalateTarget(null);
        }}
        confirmLoading={escalateLoading}
        okText="确认升级"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4 }}>升级原因：</div>
            <TextArea
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              rows={3}
              placeholder="请填写升级原因..."
            />
          </div>
          {agentOptions.length > 0 && (
            <div>
              <div style={{ marginBottom: 4 }}>指定处理人（可选）：</div>
              <Select
                value={escalateTarget}
                onChange={setEscalateTarget}
                placeholder="选择目标客服"
                allowClear
                style={{ width: '100%' }}
                options={agentOptions}
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="转交工单"
        open={transferVisible}
        onOk={handleTransfer}
        onCancel={() => {
          setTransferVisible(false);
          setTransferReason('');
          setTransferTarget(null);
        }}
        confirmLoading={transferLoading}
        okText="确认转交"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4 }}>目标客服：</div>
            <Select
              value={transferTarget}
              onChange={setTransferTarget}
              placeholder="选择目标客服"
              style={{ width: '100%' }}
              options={agentOptions}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>转交原因：</div>
            <TextArea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              rows={3}
              placeholder="请填写转交原因..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
