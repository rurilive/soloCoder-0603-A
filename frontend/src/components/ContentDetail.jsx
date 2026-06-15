import React, { useState, useEffect } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  List,
  Typography,
  Divider,
  Spin,
  Alert
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  TagOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentAPI } from '../services/api';

const { TextArea } = Input;
const { Option } = Select;
const { Title, Paragraph } = Typography;

function ContentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState({ visible: false, action: null });
  const [form] = Form.useForm();
  const [selectedTags, setSelectedTags] = useState([]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const [contentRes, logsRes] = await Promise.all([
        contentAPI.get(id),
        contentAPI.logs(id)
      ]);
      setContent(contentRes.data);
      setLogs(logsRes.data);
    } catch (err) {
      message.error('获取内容详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const handleReview = (action) => {
    setReviewModal({ visible: true, action });
    form.resetFields();
    setSelectedTags([]);
  };

  const submitReview = async (values) => {
    try {
      await contentAPI.review(id, {
        action: reviewModal.action,
        note: values.note,
        tags: selectedTags,
        reviewer: values.reviewer || '审核员'
      });
      message.success(reviewModal.action === 'approve' ? '已通过' : reviewModal.action === 'reject' ? '已拒绝' : '已打标签');
      setReviewModal({ visible: false, action: null });
      fetchDetail();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const getStatusTag = (status) => {
    const colors = {
      pending: 'orange',
      approved: 'green',
      rejected: 'red'
    };
    const texts = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝'
    };
    return <Tag color={colors[status]}>{texts[status]}</Tag>;
  };

  const getAutoReviewTag = (result) => {
    if (!result) return <Tag>-</Tag>;
    const colors = {
      auto_pass: 'green',
      auto_reject: 'red',
      manual: 'blue'
    };
    const texts = {
      auto_pass: '自动通过',
      auto_reject: '自动拒绝',
      manual: '需人工审核'
    };
    return <Tag color={colors[result]}>{texts[result]}</Tag>;
  };

  const getScoreColor = (score) => {
    if (score > 0) return 'orange';
    if (score < 0) return 'green';
    return 'default';
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  if (!content) {
    return <Alert message="内容不存在" type="error" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回列表
        </Button>
      </div>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          {getStatusTag(content.status)}
          {getAutoReviewTag(content.auto_review_result)}
          <Tag color={getScoreColor(content.auto_review_score)}>
            风险分: {content.auto_review_score}
          </Tag>
        </Space>

        <Title level={3} style={{ marginTop: 0 }}>{content.title}</Title>

        <Descriptions column={2} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="ID">{content.id}</Descriptions.Item>
          <Descriptions.Item label="作者">{content.author || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{content.source || '-'}</Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {dayjs(content.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {content.reviewed_at && (
            <>
              <Descriptions.Item label="审核人">{content.reviewed_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="审核时间">
                {dayjs(content.reviewed_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="标签" span={2}>
            <Space wrap>
              {content.tags?.length > 0
                ? content.tags.map((tag, i) => <Tag key={i}>{tag}</Tag>)
                : '-'}
            </Space>
          </Descriptions.Item>
        </Descriptions>

        {content.auto_review_reason && (
          <Alert
            message="自动审核结果"
            description={content.auto_review_reason}
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        {content.review_note && (
          <Alert
            message="审核备注"
            description={content.review_note}
            type={content.status === 'approved' ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Divider>内容正文</Divider>
        <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.8 }}>
          {content.body}
        </Paragraph>

        {content.status === 'pending' && (
          <>
            <Divider />
            <div style={{ textAlign: 'center' }}>
              <Space size="middle">
                <Button type="primary" size="large" icon={<CheckOutlined />} onClick={() => handleReview('approve')}>
                  通过审核
                </Button>
                <Button danger size="large" icon={<CloseOutlined />} onClick={() => handleReview('reject')}>
                  拒绝审核
                </Button>
                <Button size="large" icon={<TagOutlined />} onClick={() => handleReview('tag')}>
                  打标签
                </Button>
              </Space>
            </div>
          </>
        )}
      </Card>

      <Card title={<span><HistoryOutlined style={{ marginRight: 8 }} />审核日志</span>} style={{ marginTop: 16 }}>
        <List
          dataSource={logs}
          locale={{ emptyText: '暂无审核记录' }}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <List.Item.Meta
                title={
                  <Space>
                    <Tag color={
                      item.action.includes('approve') ? 'green' :
                      item.action.includes('reject') ? 'red' : 'blue'
                    }>
                      {item.action === 'auto_approve' ? '自动通过' :
                       item.action === 'auto_reject' ? '自动拒绝' :
                       item.action === 'approve' ? '人工通过' :
                       item.action === 'reject' ? '人工拒绝' :
                       item.action === 'tag' ? '打标签' : item.action}
                    </Tag>
                    <span>审核人: {item.reviewer || '系统'}</span>
                    <span style={{ color: '#999' }}>
                      {dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}
                    </span>
                  </Space>
                }
                description={
                  <div>
                    {item.note && <div>备注: {item.note}</div>}
                    {item.tags?.length > 0 && (
                      <div>
                        标签: {item.tags.map((t, i) => <Tag key={i}>{t}</Tag>)}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title={
          reviewModal.action === 'approve' ? '通过审核' :
          reviewModal.action === 'reject' ? '拒绝审核' : '打标签'
        }
        open={reviewModal.visible}
        onCancel={() => setReviewModal({ visible: false, action: null })}
        onOk={() => form.submit()}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={submitReview}>
          <Form.Item name="reviewer" label="审核员">
            <Input placeholder="请输入审核员姓名" defaultValue="审核员" />
          </Form.Item>
          <Form.Item label="标签">
            <Select
              mode="tags"
              placeholder="输入标签后按回车"
              value={selectedTags}
              onChange={setSelectedTags}
              tokenSeparators={[',']}
            >
              <Option value="优质">优质</Option>
              <Option value="广告">广告</Option>
              <Option value="敏感">敏感</Option>
              <Option value="低质">低质</Option>
              <Option value="正常">正常</Option>
            </Select>
          </Form.Item>
          <Form.Item name="note" label="审核备注">
            <TextArea rows={3} placeholder="请输入审核备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ContentDetail;
