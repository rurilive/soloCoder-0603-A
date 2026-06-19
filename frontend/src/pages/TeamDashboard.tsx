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
  Table,
  Avatar,
  Tag,
} from 'antd'
import {
  TeamOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  dashboardApi,
  agentsApi,
  TeamOverview,
  TrendPoint,
  AgentRankingItem,
} from '../api'
import TrendChart from '../components/TrendChart'
import RankingBarChart from '../components/RankingBarChart'

const { Title } = Typography
const { Option } = Select

const TeamDashboard: React.FC = () => {
  const [period, setPeriod] = useState('month')
  const [department, setDepartment] = useState('all')
  const [departments, setDepartments] = useState<string[]>([])
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [ranking, setRanking] = useState<AgentRankingItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDepartments()
  }, [])

  useEffect(() => {
    loadData()
  }, [period, department])

  const loadDepartments = async () => {
    try {
      const res = await agentsApi.listDepartments()
      setDepartments(res.data.departments)
    } catch (error) {
      console.error('加载部门列表失败', error)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [overviewRes, trendRes, rankingRes] = await Promise.all([
        dashboardApi.getTeamOverview(period, department),
        dashboardApi.getTeamTrend(period, department),
        dashboardApi.getTeamRanking(period, department, 10),
      ])
      setOverview(overviewRes.data)
      setTrendData(trendRes.data.data)
      setRanking(rankingRes.data.ranking)
    } catch (error) {
      console.error('加载数据失败', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(0)}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}分${secs}秒`
  }

  const getRankBadge = (rank: number) => {
    const colors = ['#faad14', '#d9d9d9', '#d48806']
    if (rank <= 3) {
      return <Tag color={colors[rank - 1]}>{rank}</Tag>
    }
    return <Tag>{rank}</Tag>
  }

  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (rank: number) => getRankBadge(rank),
    },
    {
      title: '客服',
      dataIndex: 'agent_name',
      key: 'agent_name',
      render: (name: string, record: AgentRankingItem) => (
        <Space>
          <Avatar size="small" src={record.avatar || undefined} />
          {name}
        </Space>
      ),
    },
    {
      title: '接待工单数',
      dataIndex: 'ticket_count',
      key: 'ticket_count',
      sorter: (a: AgentRankingItem, b: AgentRankingItem) =>
        a.ticket_count - b.ticket_count,
    },
    {
      title: '平均响应时长',
      dataIndex: 'avg_response_time',
      key: 'avg_response_time',
      render: (val: number) => formatTime(val),
      sorter: (a: AgentRankingItem, b: AgentRankingItem) =>
        a.avg_response_time - b.avg_response_time,
    },
    {
      title: '解决率',
      dataIndex: 'resolution_rate',
      key: 'resolution_rate',
      render: (val: number) => `${val.toFixed(2)}%`,
      sorter: (a: AgentRankingItem, b: AgentRankingItem) =>
        a.resolution_rate - b.resolution_rate,
    },
    {
      title: 'SLA达标率',
      dataIndex: 'sla_compliance_rate',
      key: 'sla_compliance_rate',
      render: (val: number) => `${val.toFixed(2)}%`,
      sorter: (a: AgentRankingItem, b: AgentRankingItem) =>
        a.sla_compliance_rate - b.sla_compliance_rate,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />
          团队统计看板
        </Title>
        <Space>
          <Select value={department} onChange={setDepartment} style={{ width: 160 }}>
            <Option value="all">全部部门</Option>
            {departments.map((dept) => (
              <Option key={dept} value={dept}>
                {dept}
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
                title="团队总工单"
                value={overview?.total_tickets || 0}
                prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="平均响应时长"
                value={overview?.avg_response_time || 0}
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
                value={overview?.resolution_rate || 0}
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
                value={overview?.sla_compliance_rate || 0}
                suffix="%"
                precision={2}
                prefix={<SafetyCertificateOutlined style={{ color: '#722ed1' }} />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="团队趋势" style={{ marginBottom: 24 }}>
          <TrendChart data={trendData} />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card title="成员工作量排行">
              <RankingBarChart data={ranking} />
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card title="成员排名详情">
              <Table
                dataSource={ranking}
                rowKey="agent_id"
                columns={columns}
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default TeamDashboard
