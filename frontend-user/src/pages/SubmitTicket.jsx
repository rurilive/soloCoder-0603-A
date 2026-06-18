import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Button, Card, Typography, List, Tag, Empty, Spin, message } from 'antd'
import { BookOutlined, CheckCircleOutlined, BulbOutlined } from '@ant-design/icons'
import { createTicket, getRecommendations } from '../api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const CATEGORY_COLOR_MAP = {
  account: 'blue',
  billing: 'orange',
  technical: 'purple',
  general: 'default',
  other: 'default',
}

const CATEGORY_LABEL_MAP = {
  account: '账号',
  billing: '账单',
  technical: '技术问题',
  general: '通用',
  other: '其他',
}

function RecommendationPanel({ recommendations, loading }) {
  const { knowledge_articles = [], similar_tickets = [] } = recommendations

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin tip="智能匹配中..." />
      </div>
    )
  }

  if (!knowledge_articles.length && !similar_tickets.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="输入问题描述后将为您推荐相关内容"
      />
    )
  }

  return (
    <div>
      {knowledge_articles.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Title level={5} style={{ marginBottom: 12 }}>
            <BulbOutlined style={{ marginRight: 6, color: '#faad14' }} />
            相关知识库
          </Title>
          <List
            size="small"
            dataSource={knowledge_articles}
            renderItem={(item) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Card
                  size="small"
                  style={{ width: '100%', borderRadius: 8 }}
                  bodyStyle={{ padding: '10px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <BookOutlined style={{ color: '#1890ff' }} />
                    <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                    <Tag color={CATEGORY_COLOR_MAP[item.category] || 'default'} style={{ marginLeft: 'auto', marginRight: 0 }}>
                      {CATEGORY_LABEL_MAP[item.category] || item.category}
                    </Tag>
                  </div>
                  <Paragraph
                    ellipsis={{ rows: 2, tooltip: item.content }}
                    style={{ marginBottom: 0, color: '#666', fontSize: 12 }}
                  >
                    {item.content}
                  </Paragraph>
                </Card>
              </List.Item>
            )}
          />
        </div>
      )}
      {similar_tickets.length > 0 && (
        <div>
          <Title level={5} style={{ marginBottom: 12 }}>
            <CheckCircleOutlined style={{ marginRight: 6, color: '#52c41a' }} />
            相似已解决工单
          </Title>
          <List
            size="small"
            dataSource={similar_tickets}
            renderItem={(item) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Card
                  size="small"
                  style={{ width: '100%', borderRadius: 8 }}
                  bodyStyle={{ padding: '10px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                    <Tag color={CATEGORY_COLOR_MAP[item.category] || 'default'} style={{ marginLeft: 'auto', marginRight: 0 }}>
                      {CATEGORY_LABEL_MAP[item.category] || item.category}
                    </Tag>
                  </div>
                  <Paragraph
                    ellipsis={{ rows: 2, tooltip: item.description }}
                    style={{ marginBottom: 0, color: '#666', fontSize: 12 }}
                  >
                    {item.description}
                  </Paragraph>
                </Card>
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  )
}

export default function SubmitTicket() {
  const [loading, setLoading] = useState(false)
  const [recommendations, setRecommendations] = useState({ knowledge_articles: [], similar_tickets: [] })
  const [recLoading, setRecLoading] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const debounceRef = useRef(null)
  const lastQueryRef = useRef('')

  const fetchRecommendations = useCallback(async (query, category) => {
    if (!query || query.trim().length < 2) {
      setRecommendations({ knowledge_articles: [], similar_tickets: [] })
      setRecLoading(false)
      return
    }
    setRecLoading(true)
    try {
      const res = await getRecommendations({ query: query.trim(), category: category || undefined, limit: 5 })
      setRecommendations(res.data)
    } catch {
      setRecommendations({ knowledge_articles: [], similar_tickets: [] })
    } finally {
      setRecLoading(false)
    }
  }, [])

  const handleValuesChange = useCallback((changed, all) => {
    const query = `${all.title || ''} ${all.description || ''}`.trim()
    if (query === lastQueryRef.current) return
    lastQueryRef.current = query

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchRecommendations(query, all.category)
    }, 500)
  }, [fetchRecommendations])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await createTicket(values)
      message.success('工单提交成功')
      navigate(`/ticket/${res.data.id}`)
    } catch (err) {
      message.error(err.response?.data?.detail || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Title level={4}>提交工单</Title>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 60%', minWidth: 0 }}>
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              initialValues={{ priority: 'medium', category: 'general' }}
              size="large"
              onValuesChange={handleValuesChange}
            >
              <Form.Item
                label="标题"
                name="title"
                rules={[
                  { required: true, message: '请输入工单标题' },
                  { max: 200, message: '标题最多200个字符' },
                ]}
              >
                <Input placeholder="请简要描述您的问题" />
              </Form.Item>
              <Form.Item
                label="问题描述"
                name="description"
                rules={[{ required: true, message: '请输入问题描述' }]}
              >
                <TextArea rows={6} placeholder="请详细描述您遇到的问题，以便我们更好地为您提供帮助" />
              </Form.Item>
              <Form.Item label="优先级" name="priority">
                <Select>
                  <Select.Option value="low">低</Select.Option>
                  <Select.Option value="medium">中</Select.Option>
                  <Select.Option value="high">高</Select.Option>
                  <Select.Option value="urgent">紧急</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item label="分类" name="category">
                <Select>
                  <Select.Option value="general">通用</Select.Option>
                  <Select.Option value="technical">技术问题</Select.Option>
                  <Select.Option value="billing">账单</Select.Option>
                  <Select.Option value="account">账号</Select.Option>
                  <Select.Option value="other">其他</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>
                  提交工单
                </Button>
                <Button style={{ marginLeft: 12 }} onClick={() => navigate('/')}>
                  取消
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </div>
        <div style={{ flex: '1 1 40%', minWidth: 0, position: 'sticky', top: 24 }}>
          <Card
            title={
              <span>
                <BulbOutlined style={{ marginRight: 6, color: '#faad14' }} />
                智能推荐
              </span>
            }
            style={{ borderRadius: 8 }}
          >
            <RecommendationPanel recommendations={recommendations} loading={recLoading} />
          </Card>
        </div>
      </div>
    </div>
  )
}
