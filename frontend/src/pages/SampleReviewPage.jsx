import React, { useState, useEffect } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, Select, Slider, message,
  Space, Card, Row, Col, Statistic, Progress, Divider, Descriptions,
  InputNumber, Tabs, Empty
} from 'antd';
import {
  PlayCircleOutlined, ReloadOutlined, EyeOutlined,
  CheckCircleOutlined, CloseCircleOutlined, HistoryOutlined, ClockCircleOutlined,
  AuditOutlined
} from '@ant-design/icons';
import { samplingAPI } from '../services/api';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { TabPane } = Tabs;
const { Option } = Select;

function SampleReviewPage() {
  const [batches, setBatches] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [runModalVisible, setRunModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [currentReviews, setCurrentReviews] = useState([]);
  const [currentReview, setCurrentReview] = useState(null);
  const [runForm] = Form.useForm();
  const [reviewForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, pendingRes] = await Promise.all([
        samplingAPI.listBatches(),
        samplingAPI.pendingReviews()
      ]);
      setBatches(batchesRes.data);
      setPending(pendingRes.data);
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRunSampling = async () => {
    try {
      const values = await runForm.validateFields();
      const res = await samplingAPI.run({
        sample_rate: values.sample_rate / 100,
        max_samples: values.max_samples,
        batch_id: values.batch_id || undefined
      });
      message.success(`抽样任务创建成功，抽取了 ${res.data.sample_count} 条内容`);
      setRunModalVisible(false);
      runForm.resetFields();
      fetchData();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.detail || '抽样失败');
    }
  };

  const handleViewBatch = async (batch) => {
    try {
      const res = await samplingAPI.getBatchReviews(batch.batch_id);
      setCurrentBatch(batch);
      setCurrentReviews(res.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取批次详情失败');
    }
  };

  const handleOpenReview = (sr) => {
    setCurrentReview(sr);
    reviewForm.resetFields();
    setReviewModalVisible(true);
  };

  const handleSubmitReview = async () => {
    try {
      const values = await reviewForm.validateFields();
      await samplingAPI.review(currentReview.id, {
        result: values.result,
        note: values.note,
        reviewer: values.reviewer || 'reviewer'
      });
      message.success('复审完成');
      setReviewModalVisible(false);
      fetchData();
      if (currentBatch) {
        handleViewBatch(currentBatch);
      }
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.detail || '复审失败');
    }
  };

  const totalBatches = batches.length;
  const activeBatches = batches.filter(b => b.status === 'active').length;
  const totalSampled = batches.reduce((acc, b) => acc + b.sample_count, 0);
  const totalReviewed = batches.reduce((acc, b) => acc + b.reviewed_count, 0);
  const totalConsistent = batches.reduce((acc, b) => acc + b.consistent_count, 0);
  const overallConsistency = totalReviewed > 0 ? (totalConsistent / totalReviewed * 100).toFixed(1) : null;

  const batchColumns = [
    { title: '批次ID', dataIndex: 'batch_id', ellipsis: true, width: 200 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s) => s === 'active'
        ? <Tag color="processing">进行中</Tag>
        : <Tag color="success">已完成</Tag>
    },
    {
      title: '抽样数', dataIndex: 'sample_count', width: 90,
      render: (v) => <b>{v}</b>
    },
    {
      title: '已复审', dataIndex: 'reviewed_count', width: 90,
      render: (v, r) => `${v}/${r.sample_count}`
    },
    { title: '一致', dataIndex: 'consistent_count', width: 70 },
    { title: '不一致', dataIndex: 'inconsistent_count', width: 80 },
    {
      title: '一致率', dataIndex: 'consistency_rate', width: 100,
      render: (v) => v != null
        ? <Tag color={v >= 0.8 ? 'green' : v >= 0.6 ? 'orange' : 'red'}>
            {(v * 100).toFixed(1)}%
          </Tag>
        : <Tag color="default">-</Tag>
    },
    {
      title: '抽样比例', dataIndex: 'sample_rate', width: 100,
      render: (v) => `${(v * 100).toFixed(0)}%`
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 170,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewBatch(r)}>查看</Button>
      )
    }
  ];

  const reviewColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '内容标题', dataIndex: ['content', 'title'], ellipsis: true,
      render: (t, r) => t || `内容#${r.content_id}`
    },
    {
      title: '原始结果', dataIndex: 'original_status', width: 100,
      render: (s) => s === 'approved'
        ? <Tag color="green">通过</Tag>
        : <Tag color="red">拒绝</Tag>
    },
    {
      title: '原审核人', dataIndex: 'original_reviewer', width: 100
    },
    {
      title: '复审状态', dataIndex: 'review_status', width: 100,
      render: (s) => s === 'pending'
        ? <Tag color="processing"><ClockCircleOutlined /> 待复审</Tag>
        : <Tag color="success"><AuditOutlined /> 已复审</Tag>
    },
    {
      title: '复审结果', dataIndex: 'review_result', width: 100,
      render: (s) => {
        if (!s) return '-';
        return s === 'approve'
          ? <Tag color="green">通过</Tag>
          : <Tag color="red">拒绝</Tag>;
      }
    },
    {
      title: '一致性', dataIndex: 'is_consistent', width: 100,
      render: (v) => {
        if (v == null) return '-';
        return v
          ? <Tag color="green"><CheckCircleOutlined /> 一致</Tag>
          : <Tag color="red"><CloseCircleOutlined /> 不一致</Tag>;
      }
    },
    {
      title: '复审人', dataIndex: 'reviewed_by', width: 100
    },
    {
      title: '操作', width: 120, fixed: 'right',
      render: (_, r) => r.review_status === 'pending' && (
        <Button type="primary" size="small" onClick={() => handleOpenReview(r)}>
          复审
        </Button>
      )
    }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="抽样批次"
              value={totalBatches}
              prefix={<HistoryOutlined />}
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              进行中 {activeBatches} 个
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已抽样内容"
              value={totalSampled}
              prefix={<AuditOutlined />}
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              待复审 {pending.length} 条
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已完成复审"
              value={totalReviewed}
              prefix={<CheckCircleOutlined />}
            />
            <Progress
              percent={totalSampled > 0 ? Math.round(totalReviewed / totalSampled * 100) : 0}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="整体一致率"
              value={overallConsistency || '-'}
              suffix={overallConsistency ? '%' : ''}
              valueStyle={{ color: overallConsistency >= 80 ? '#52c41a' : overallConsistency >= 60 ? '#faad14' : '#ff4d4f' }}
              prefix={<Tag color="blue">质量</Tag>}
            />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="batches">
        <TabPane tab={<span><HistoryOutlined /> 抽样批次</span>} key="batches">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>共 {batches.length} 个抽样批次</span>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => {
                runForm.resetFields();
                runForm.setFieldsValue({ sample_rate: 10, max_samples: 20 });
                setRunModalVisible(true);
              }}>
                手动抽样
              </Button>
            </Space>
          </div>
          <Table
            dataSource={batches}
            columns={batchColumns}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1100 }}
            locale={{ emptyText: <Empty description="暂无抽样批次，系统会每60秒自动执行一次（需达到最小样本量）" /> }}
          />
        </TabPane>
        <TabPane tab={<span><ClockCircleOutlined /> 待复审 ({pending.length})</span>} key="pending">
          <div style={{ marginBottom: 16 }}>
            共 {pending.length} 条内容等待复审，系统每10秒自动刷新
          </div>
          <Table
            dataSource={pending}
            columns={reviewColumns}
            rowKey="id"
            loading={loading}
            expandable={{
              expandedRowRender: (record) => (
                <Card size="small" style={{ background: '#fafafa' }}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="原因">{record.sample_reason}</Descriptions.Item>
                    <Descriptions.Item label="批次ID">{record.sample_batch_id}</Descriptions.Item>
                  </Descriptions>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ whiteSpace: 'pre-wrap', color: '#555' }}>
                    {record.content?.body || '(无内容)'}
                  </div>
                </Card>
              )
            }}
            locale={{ emptyText: <Empty description="暂无待复审内容" /> }}
          />
        </TabPane>
      </Tabs>

      <Modal
        title="创建手动抽样任务"
        open={runModalVisible}
        onCancel={() => setRunModalVisible(false)}
        onOk={handleRunSampling}
        okText="开始抽样"
        cancelText="取消"
        width={600}
      >
        <Form form={runForm} layout="vertical">
          <Form.Item name="sample_rate" label="抽样比例 (%)" rules={[{ required: true }]}>
            <Slider min={1} max={100} />
          </Form.Item>
          <div style={{ marginTop: -16, color: '#888', fontSize: 12, marginBottom: 16 }}>
            当前: {runForm.getFieldValue('sample_rate') || 10}%
          </div>
          <Form.Item name="max_samples" label="最大样本数（上限）" rules={[{ required: true }]}>
            <InputNumber min={1} max={500} style={{ width: '100%' }} placeholder="例如 20" />
          </Form.Item>
          <Form.Item name="batch_id" label="自定义批次ID（可选）">
            <Input placeholder="留空则自动生成" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批次详情 - ${currentBatch?.batch_id || ''}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={1000}
      >
        {currentBatch && (
          <>
            <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="批次ID">{currentBatch.batch_id}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {currentBatch.status === 'active' ? <Tag color="processing">进行中</Tag> : <Tag color="success">已完成</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(currentBatch.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="抽样数">{currentBatch.sample_count}</Descriptions.Item>
              <Descriptions.Item label="已复审">{currentBatch.reviewed_count}</Descriptions.Item>
              <Descriptions.Item label="抽样比例">{(currentBatch.sample_rate * 100).toFixed(0)}%</Descriptions.Item>
              <Descriptions.Item label="一致数" span={1.5}>
                <Tag color="green">{currentBatch.consistent_count}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="不一致数" span={1.5}>
                <Tag color="red">{currentBatch.inconsistent_count}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="一致率">
                {currentBatch.consistency_rate != null
                  ? <Tag color={currentBatch.consistency_rate >= 0.8 ? 'green' : 'orange'}>
                      {(currentBatch.consistency_rate * 100).toFixed(1)}%
                    </Tag>
                  : <Tag color="default">-</Tag>}
              </Descriptions.Item>
            </Descriptions>
            <Divider orientation="left">抽样内容复审详情</Divider>
            <Table
              dataSource={currentReviews}
              columns={reviewColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              expandable={{
                expandedRowRender: (record) => (
                  <Card size="small" style={{ background: '#fafafa' }}>
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="作者">{record.content?.author || '-'}</Descriptions.Item>
                      <Descriptions.Item label="来源">{record.content?.source || '-'}</Descriptions.Item>
                      <Descriptions.Item label="ML风险分" span={2}>
                        {record.content?.ml_score != null
                          ? `${(record.content.ml_score * 100).toFixed(1)}% (置信度 ${(record.content.ml_confidence || 0) * 100}%)`
                          : '-'
                        }
                      </Descriptions.Item>
                    </Descriptions>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>正文：</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#555' }}>
                      {record.content?.body || '(无内容)'}
                    </div>
                  </Card>
                )
              }}
            />
          </>
        )}
      </Modal>

      <Modal
        title="抽样复审"
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        onOk={handleSubmitReview}
        okText="提交复审"
        cancelText="取消"
        width={700}
      >
        {currentReview && (
          <>
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="标题">{currentReview.content?.title || `内容#${currentReview.content_id}`}</Descriptions.Item>
                <Descriptions.Item label="原审核人">{currentReview.original_reviewer}</Descriptions.Item>
                <Descriptions.Item label="原始审核结果">
                  {currentReview.original_status === 'approved'
                    ? <Tag color="green">通过</Tag>
                    : <Tag color="red">拒绝</Tag>
                  }
                </Descriptions.Item>
                <Descriptions.Item label="抽样原因">{currentReview.sample_reason}</Descriptions.Item>
              </Descriptions>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ whiteSpace: 'pre-wrap', color: '#555', maxHeight: 150, overflow: 'auto' }}>
                {currentReview.content?.body || '(无内容)'}
              </div>
            </Card>
            <Form form={reviewForm} layout="vertical">
              <Form.Item name="result" label="复审结果" rules={[{ required: true, message: '请选择复审结果' }]}>
                <Select placeholder="请选择">
                  <Option value="approve">
                    <CheckCircleOutlined style={{ color: '#52c41a' }} /> 通过（与原结果{currentReview.original_status === 'approved' ? '一致' : '不一致'}）
                  </Option>
                  <Option value="reject">
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> 拒绝（与原结果{currentReview.original_status === 'rejected' ? '一致' : '不一致'}）
                  </Option>
                </Select>
              </Form.Item>
              <Form.Item name="reviewer" label="复审人">
                <Input placeholder="请输入复审人" defaultValue="reviewer" />
              </Form.Item>
              <Form.Item name="note" label="复审备注">
                <TextArea rows={3} placeholder="请输入复审备注说明" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}

export default SampleReviewPage;
