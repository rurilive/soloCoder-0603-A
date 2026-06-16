import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Result, Spin, Tag, Space } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { contentAPI, mlThresholdAPI } from '../services/api';

const { TextArea } = Input;

function SubmitPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [thresholds, setThresholds] = useState({ pass_threshold: 0.3, reject_threshold: 0.7 });

  const fetchThresholds = async () => {
    try {
      const res = await mlThresholdAPI.active();
      setThresholds(res.data);
    } catch (err) {
      // 保持默认值
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await contentAPI.submit(values);
      setResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getResultStatus = (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      default:
        return 'info';
    }
  };

  const getResultTitle = (data) => {
    if (data.status === 'approved') {
      return '自动审核通过，内容已发布';
    } else if (data.status === 'rejected') {
      return '自动审核拒绝';
    } else {
      return '已进入人工审核队列';
    }
  };

  const getImageReviewTag = (result) => {
    if (!result) return null;
    const colors = { safe: 'green', unsafe: 'red', uncertain: 'orange' };
    const texts = { safe: '图片正常', unsafe: '图片违规', uncertain: '图片需人工' };
    return <Tag color={colors[result]}>{texts[result]}</Tag>;
  };

  const getResultSubTitle = (data) => {
    const score = data.combined_score;
    let scoreColor = 'default';
    if (score != null) {
      if (score <= thresholds.pass_threshold) scoreColor = 'green';
      else if (score >= thresholds.reject_threshold) scoreColor = 'red';
      else scoreColor = 'orange';
    }
    return (
      <Space direction="vertical" size="small">
        <div>
          <span style={{ marginRight: 16 }}>综合风险分: <Tag color={scoreColor}>{score != null ? `${(score * 100).toFixed(1)}%` : '-'}</Tag></span>
          <span>内容ID: {data.id}</span>
          {data.image_review_result && getImageReviewTag(data.image_review_result)}
        </div>
        {data.image_url && (
          <div>
            <img src={data.image_url} alt="提交的图片" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 4 }} />
          </div>
        )}
        {data.auto_review_reason && (
          <div style={{ color: '#666' }}>
            审核原因: {data.auto_review_reason}
          </div>
        )}
      </Space>
    );
  };

  const handleReset = () => {
    form.resetFields();
    setResult(null);
  };

  if (result) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <Result
          status={getResultStatus(result.status)}
          title={getResultTitle(result)}
          subTitle={getResultSubTitle(result)}
          extra={[
            <Button type="primary" onClick={handleReset}>
              继续提交
            </Button>
          ]}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card title="提交待审核内容">
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: '请输入标题' }]}
            >
              <Input placeholder="请输入内容标题" size="large" />
            </Form.Item>
            <Form.Item
              name="body"
              label="内容正文"
              rules={[{ required: true, message: '请输入内容正文' }]}
            >
              <TextArea rows={8} placeholder="请输入内容正文" />
            </Form.Item>
            <Form.Item
              name="image_url"
              label="图片URL"
              extra="支持https://图片链接，将自动进行鉴黄审核"
            >
              <Input placeholder="请输入图片URL（可选）" />
            </Form.Item>
            <Form.Item name="author" label="作者">
              <Input placeholder="请输入作者（可选）" />
            </Form.Item>
            <Form.Item name="source" label="来源">
              <Input placeholder="请输入来源（可选）" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" icon={<SendOutlined />}>
                提交审核
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  );
}

export default SubmitPage;
