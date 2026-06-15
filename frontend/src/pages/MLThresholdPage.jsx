import React, { useState, useEffect } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, Slider, Switch, message,
  Popconfirm, Space, Card, Row, Col, Statistic, Progress, Divider
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import { mlThresholdAPI, mlHealthAPI } from '../services/api';
import dayjs from 'dayjs';

const { TextArea } = Input;

function MLThresholdPage() {
  const [configs, setConfigs] = useState([]);
  const [activeConfig, setActiveConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [form] = Form.useForm();
  const [mlHealth, setMlHealth] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listRes, activeRes, healthRes] = await Promise.all([
        mlThresholdAPI.list(),
        mlThresholdAPI.active(),
        mlHealthAPI.check().catch(() => ({ data: { ml_api_available: false } }))
      ]);
      setConfigs(listRes.data);
      setActiveConfig(activeRes.data);
      setMlHealth(healthRes.data);
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = () => {
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({
      pass_threshold: 0.3,
      reject_threshold: 0.7,
      ml_weight: 0.5,
      rule_weight: 0.5,
      enabled: true
    });
    setModalVisible(true);
  };

  const handleEdit = (cfg) => {
    setEditingConfig(cfg);
    form.setFieldsValue(cfg);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await mlThresholdAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.detail || '删除失败');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (values.reject_threshold <= values.pass_threshold) {
        message.error('拒绝阈值必须大于通过阈值');
        return;
      }
      if (editingConfig) {
        const { name, ...rest } = values;
        await mlThresholdAPI.update(editingConfig.id, rest);
        message.success('更新成功');
      } else {
        await mlThresholdAPI.create(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.detail || (editingConfig ? '更新失败' : '创建失败'));
    }
  };

  const handleActivate = async (id) => {
    try {
      await mlThresholdAPI.activate(id);
      message.success('已激活该配置');
      fetchData();
    } catch (err) {
      message.error('激活失败');
    }
  };

  const columns = [
    {
      title: 'ID', dataIndex: 'id', width: 60,
    },
    {
      title: '名称', dataIndex: 'name',
      render: (text, record) => (
        <Space>
          {text}
          {activeConfig?.id === record.id && <Tag color="gold">当前生效</Tag>}
        </Space>
      )
    },
    {
      title: '通过阈值', dataIndex: 'pass_threshold', width: 120,
      render: (v) => <Tag color="green">{(v * 100).toFixed(0)}%</Tag>
    },
    {
      title: '拒绝阈值', dataIndex: 'reject_threshold', width: 120,
      render: (v) => <Tag color="red">{(v * 100).toFixed(0)}%</Tag>
    },
    {
      title: 'ML权重', dataIndex: 'ml_weight', width: 100,
      render: (v) => <Tag color="blue">{(v * 100).toFixed(0)}%</Tag>
    },
    {
      title: '规则权重', dataIndex: 'rule_weight', width: 100,
      render: (v) => <Tag color="purple">{(v * 100).toFixed(0)}%</Tag>
    },
    {
      title: '状态', dataIndex: 'enabled', width: 90,
      render: (v) => v ? <Tag color="green">启用</Tag> : <Tag color="default">禁用</Tag>
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '更新时间', dataIndex: 'updated_at', width: 170,
      render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {activeConfig?.id !== record.id && (
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={() => handleActivate(record.id)}>
              激活
            </Button>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此配置？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const passPct = activeConfig ? activeConfig.pass_threshold * 100 : 0;
  const rejectPct = activeConfig ? activeConfig.reject_threshold * 100 : 0;
  const manualPct = rejectPct - passPct;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="ML模型服务状态"
              value={mlHealth?.ml_api_available ? '正常' : '不可用'}
              valueStyle={{ color: mlHealth?.ml_api_available ? '#52c41a' : '#ff4d4f' }}
              prefix={mlHealth?.ml_api_available ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              {mlHealth?.ml_api_url || 'N/A'}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="阈值配置数量"
              value={configs.length}
              prefix={<Tag color="blue">配置</Tag>}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="当前生效配置">
            <div style={{ fontWeight: 'bold' }}>{activeConfig?.name || 'N/A'}</div>
            <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
              通过 ≤ {(activeConfig?.pass_threshold * 100 || 0).toFixed(0)}%，
              拒绝 ≥ {(activeConfig?.reject_threshold * 100 || 0).toFixed(0)}%
            </div>
            <div style={{ color: '#666', fontSize: 12 }}>
              ML权重 {(activeConfig?.ml_weight * 100 || 0).toFixed(0)}% /
              规则权重 {(activeConfig?.rule_weight * 100 || 0).toFixed(0)}%
            </div>
          </Card>
        </Col>
      </Row>

      {activeConfig && (
        <Card title="审核决策区间（基于综合风险分 [0, 1]）" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 8 }}>
                <Tag color="green">自动通过区间</Tag> 0% ~ {passPct.toFixed(0)}%
              </div>
              <Progress percent={passPct} strokeColor="#52c41a" showInfo={false} />
            </Col>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 8 }}>
                <Tag color="blue">人工审核区间</Tag> {passPct.toFixed(0)}% ~ {rejectPct.toFixed(0)}%
              </div>
              <Progress percent={manualPct > 0 ? manualPct : 0} strokeColor="#1890ff" showInfo={false} />
            </Col>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 8 }}>
                <Tag color="red">自动拒绝区间</Tag> {rejectPct.toFixed(0)}% ~ 100%
              </div>
              <Progress percent={100 - rejectPct} strokeColor="#ff4d4f" showInfo={false} />
            </Col>
          </Row>
          <Divider style={{ margin: '16px 0' }} />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 8 }}>模型（ML）权重分配</div>
              <Progress percent={activeConfig.ml_weight * 100} strokeColor="#722ed1" />
            </Col>
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 8 }}>规则引擎权重分配</div>
              <Progress percent={activeConfig.rule_weight * 100} strokeColor="#13c2c2" />
            </Col>
          </Row>
        </Card>
      )}

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>共 {configs.length} 个ML阈值配置</span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加配置</Button>
        </Space>
      </div>

      <Table
        dataSource={configs}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingConfig ? '编辑ML阈值配置' : '添加ML阈值配置'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="确认"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!editingConfig && (
            <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
              <Input placeholder="如：默认配置 / 严格模式 / 宽松模式" />
            </Form.Item>
          )}
          <Divider orientation="left">阈值设置 (风险分范围 0~1)</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pass_threshold" label="通过阈值 (≤) " rules={[{ required: true }]}>
                <Slider min={0} max={1} step={0.01} />
              </Form.Item>
              <div style={{ marginTop: -12, color: '#888', fontSize: 12 }}>
                当前: {((form.getFieldValue('pass_threshold') ?? 0.3) * 100).toFixed(0)}%
              </div>
            </Col>
            <Col span={12}>
              <Form.Item name="reject_threshold" label="拒绝阈值 (≥) " rules={[{ required: true }]}>
                <Slider min={0} max={1} step={0.01} />
              </Form.Item>
              <div style={{ marginTop: -12, color: '#888', fontSize: 12 }}>
                当前: {((form.getFieldValue('reject_threshold') ?? 0.7) * 100).toFixed(0)}%
              </div>
            </Col>
          </Row>
          <Divider orientation="left">权重分配 (合计应约等于 1)</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="ml_weight" label="ML模型权重" rules={[{ required: true }]}>
                <Slider min={0} max={1} step={0.05} />
              </Form.Item>
              <div style={{ marginTop: -12, color: '#888', fontSize: 12 }}>
                当前: {((form.getFieldValue('ml_weight') ?? 0.5) * 100).toFixed(0)}%
              </div>
            </Col>
            <Col span={12}>
              <Form.Item name="rule_weight" label="规则引擎权重" rules={[{ required: true }]}>
                <Slider min={0} max={1} step={0.05} />
              </Form.Item>
              <div style={{ marginTop: -12, color: '#888', fontSize: 12 }}>
                当前: {((form.getFieldValue('rule_weight') ?? 0.5) * 100).toFixed(0)}%
              </div>
            </Col>
          </Row>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item name="description" label="配置描述">
            <TextArea rows={2} placeholder="配置说明、适用场景等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default MLThresholdPage;
