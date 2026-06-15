import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, Select, message, Empty } from 'antd';
import { EyeOutlined, CheckOutlined, CloseOutlined, TagOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentAPI } from '../services/api';

const { TextArea } = Input;
const { Option } = Select;

function QueuePage() {
  const navigate = useNavigate();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewModal, setReviewModal] = useState({ visible: false, content: null });
  const [form] = Form.useForm();
  const [selectedTags, setSelectedTags] = useState([]);

  const fetchContents = async () => {
    setLoading(true);
    try {
      const res = await contentAPI.list('pending');
      setContents(res.data);
    } catch (err) {
      message.error('获取待审内容失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContents();
    const interval = setInterval(fetchContents, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleReview = (content, action) => {
    setReviewModal({ visible: true, content, action });
    form.resetFields();
    setSelectedTags([]);
  };

  const submitReview = async (values) => {
    try {
      await contentAPI.review(reviewModal.content.id, {
        action: reviewModal.action,
        note: values.note,
        tags: selectedTags,
        reviewer: values.reviewer || '审核员'
      });
      message.success(reviewModal.action === 'approve' ? '已通过' : '已拒绝');
      setReviewModal({ visible: false, content: null });
      fetchContents();
    } catch (err) {
      message.error('审核失败');
    }
  };

  const getAutoReviewInfo = (record) => {
    const score = record.auto_review_score;
    let color = 'default';
    if (score > 0) color = 'orange';
    return (
      <Space size="small" wrap>
        <Tag color={color}>
          风险分: {score}
        </Tag>
        {record.auto_review_result === 'manual' && <Tag color="blue">需人工审核</Tag>}
        {record.image_review_result === 'unsafe' && <Tag color="red">图片违规</Tag>}
        {record.image_review_result === 'uncertain' && <Tag color="orange">图片需人工</Tag>}
        {record.image_review_result === 'safe' && <Tag color="green">图片正常</Tag>}
      </Space>
    );
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (text, record) => (
        <Space>
          {record.image_url && <span>🖼️</span>}
          <a onClick={() => navigate(`/content/${record.id}`)}>{text}</a>
        </Space>
      )
    },
    {
      title: '作者',
      dataIndex: 'author',
      width: 100
    },
    {
      title: '自动审核',
      dataIndex: 'auto_review_result',
      width: 180,
      render: (_, record) => getAutoReviewInfo(record)
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      width: 180,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space size="small">
          <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/content/${record.id}`)}>
            查看
          </Button>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleReview(record, 'approve')}>
            通过
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReview(record, 'reject')}>
            拒绝
          </Button>
          <Button size="small" icon={<TagOutlined />} onClick={() => handleReview(record, 'tag')}>
            打标签
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>共 {contents.length} 条待审核内容</span>
        <Button icon={<ReloadOutlined />} onClick={fetchContents}>刷新</Button>
      </div>
      <Table
        dataSource={contents}
        columns={columns}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: <Empty description="暂无待审核内容" /> }}
      />

      <Modal
        title={reviewModal.action === 'approve' ? '通过审核' : reviewModal.action === 'reject' ? '拒绝审核' : '打标签'}
        open={reviewModal.visible}
        onCancel={() => setReviewModal({ visible: false, content: null })}
        onOk={() => form.submit()}
        okText="确认"
        cancelText="取消"
      >
        {reviewModal.content && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <div><strong>标题:</strong> {reviewModal.content.title}</div>
              <div style={{ marginTop: 8 }}><strong>自动审核原因:</strong> {reviewModal.content.auto_review_reason || '无'}</div>
            </div>
            <Form form={form} layout="vertical">
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
          </div>
          )}
      </Modal>
    </div>
  );
}

export default QueuePage;
