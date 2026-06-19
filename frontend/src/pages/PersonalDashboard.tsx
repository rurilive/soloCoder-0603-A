import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Select,
  Space,
  Typography,
  Spin,
  Avatar,
} from 'antd'
import {
  FileTextOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { dashboardApi, agentsApi, PersonalStats, TrendPoint, AgentInfo } from '../api'
import TrendChart from '../components/TrendChart'

const { Title } = Typography
const { Option } = Select

const PersonalDashboard: React.FC = () => {
  const [period, setPeriod] = useState('month')
  const [agentId, setAgentId] = useState<number | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [stats, setStats] = useState<PersonalStats | null>(null)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [currentAgent, setCurrentAgent] = useState<AgentInfo | null>(null)

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (agentId) {
      loadData()
    }
  }, [agentId, period])

  const loadAgents = async () => {
    try {
      const res = await agentsApi.listAgents()
      setAgents(res.data)
      if (res.data.length > 0) {
        setAgentId(res.data[0].id)
        setCurrentAgent(res.data[0])
      }
    } catch (error) {
      console.error('加载客服列表失败', error)
    }
  }

  const loadData = async () => {
    if (!agentId) return
    setLoading(true)
    try {
      const [statsRes, trendRes] = await Promise.all([
        dashboardApi.getPersonalStats(agentId, period),
        dashboardApi.getPersonalTrend(agentId, period),
      ])
      setStats(statsRes.data)
      setTrendData(trendRes.data.data)
    } catch (error) {
      console.error('加载数据失败', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAgentChange = (id: number) => {
    setAgentId(id)
    const agent = agents.find((a) => a.id === id)
    setCurrentAgent(agent || null)
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}分${secs}秒`
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {currentAgent && (
            <Avatar size={48} src={currentAgent.avatar || undefined} icon={<UserOutlined />} />
          )}
          <div>
            <Title level={4} style={{ margin: 0 }}>
              个人绩效看板
            </Title>
            <div style={{ color: '#666' }}>
              {currentAgent ? `${currentAgent.name} · ${currentAgent.department || ''}` : ''}
            </div>
          </div>
        </div>
        <Space>
          <Select
            style={{ width: 160 }}
            value={agentId}
            onChange={handleAgentChange}
            placeholder="选择客服"
          >
            {agents.map((agent) => (
              <Option key={agent.id} value={agent.id}>
                {agent.name}
              </Option>
            ))}
          </Select>
          <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
            <Option value="day">今日</Option>
            <Option value="week">本周</Option>
            <Option value="month">本月</Option>
            <Option value="quarter">本季度</Option>
          </Select>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="接待工单数"
                value={stats?.ticket_count || 0}
                prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="平均响应时长"
                value={stats?.avg_response_time || 0}
                formatter={(val) => formatTime(val as number)}
                prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="解决率"
                value={stats?.resolution_rate || 0}
                suffix="%"
                precision={2}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="SLA达标率"
                value={stats?.sla_compliance_rate || 0}
                suffix="%"
                precision={2}
                prefix={<SafetyCertificateOutlined style={{ color: '#722ed1' }} />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="绩效趋势" style={{ marginBottom: 24 }}>
          <TrendChart data={trendData} />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="已解决工单">
              <Statistic
                value={stats?.resolved_count || 0}
                suffix="件"
                valueStyle={{ fontSize: 32 }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="平均满意度">
              <Statistic
                value={stats?.avg_satisfaction || 0}
                suffix="/ 5"
                precision={2}
                valueStyle={{ fontSize: 32, color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default PersonalDashboard
