import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Button, Card, Typography, message } from 'antd'
import { createTicket } from '../api'

const { Title } = Typography
const { TextArea } = Input

export default function SubmitTicket() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Title level={4}>提交工单</Title>
      <Card>
        <Form
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ priority: 'medium', category: 'general' }}
          size="large"
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
  )
}
