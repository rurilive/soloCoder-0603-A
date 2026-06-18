import { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  message,
  Spin,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getSLARules,
  createSLARule,
  updateSLARule,
  deleteSLARule,
} from '../api';

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

const categoryOptions = [
  { value: 'general', label: '通用' },
  { value: 'technical', label: '技术' },
  { value: 'billing', label: '账单' },
  { value: 'account', label: '账号' },
];

function formatMinutes(min) {
  if (min >= 1440) return `${Math.floor(min / 1440)}天${min % 1440 > 0 ? Math.floor((min % 1440) / 60) + '小时' : ''}`;
  if (min >= 60) return `${Math.floor(min / 60)}小时${min % 60 > 0 ? (min % 60) + '分' : ''}`;
  return `${min}分钟`;
}

export default function SLARules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await getSLARules();
      setRules(res.data || []);
    } catch {
      message.error('加载SLA规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({
      warning_threshold: 0.75,
      auto_escalate: false,
    });
    setModalVisible(true);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      category: rule.category,
      priority: rule.priority,
      response_time_minutes: rule.response_time_minutes,
      resolution_time_minutes: rule.resolution_time_minutes,
      warning_threshold: rule.warning_threshold,
      auto_escalate: rule.auto_escalate,
      is_active: rule.is_active,
    });
    setModalVisible(true);
  };

  const handleDelete = async (rule) => {
    Modal.confirm({
      title: '确认停用',
      content: `确定要停用分类"${rule.category}"、优先级"${priorityLabels[rule.priority]}"的SLA规则吗？`,
      okText: '确认停用',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteSLARule(rule.id);
          message.success('已停用该规则');
          loadRules();
        } catch (err) {
          message.error(err.response?.data?.detail || '操作失败');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingRule) {
        await updateSLARule(editingRule.id, values);
        message.success('规则已更新');
      } else {
        await createSLARule(values);
        message.success('规则已创建');
      }
      setModalVisible(false);
      loadRules();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.detail || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: '分类',
      dataIndex: 'category',
      width: 120,
      render: (val) => {
        const opt = categoryOptions.find((o) => o.value === val);
        return opt ? opt.label : val;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 100,
      render: (val) => (
        <Tag color={priorityColors[val]}>{priorityLabels[val] || val}</Tag>
      ),
    },
    {
      title: '响应时间',
      dataIndex: 'response_time_minutes',
      width: 130,
      render: (val) => formatMinutes(val),
    },
    {
      title: '解决时间',
      dataIndex: 'resolution_time_minutes',
      width: 130,
      render: (val) => formatMinutes(val),
    },
    {
      title: '预警阈值',
      dataIndex: 'warning_threshold',
      width: 100,
      render: (val) => `${Math.round(val * 100)}%`,
    },
    {
      title: '自动升级',
      dataIndex: 'auto_escalate',
      width: 100,
      render: (val) => (val ? <Tag color="red">开启</Tag> : <Tag>关闭</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 100,
      render: (val) => (val ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>),
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.is_active && (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            >
              停用
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>SLA规则配置</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建规则
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rules}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <Modal
        title={editingRule ? '编辑SLA规则' : '新建SLA规则'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="category"
            label="工单分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="选择分类" disabled={!!editingRule} options={categoryOptions} />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级"
            rules={[{ required: true, message: '请选择优先级' }]}
          >
            <Select
              placeholder="选择优先级"
              disabled={!!editingRule}
              options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item
            name="response_time_minutes"
            label="首次响应时间（分钟）"
            rules={[{ required: true, message: '请输入响应时间' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="例如：30" />
          </Form.Item>
          <Form.Item
            name="resolution_time_minutes"
            label="问题解决时间（分钟）"
            rules={[{ required: true, message: '请输入解决时间' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="例如：480（8小时）" />
          </Form.Item>
          <Form.Item
            name="warning_threshold"
            label="预警阈值（已用时间占比）"
            rules={[{ required: true, message: '请输入预警阈值' }]}
          >
            <InputNumber
              min={0.1}
              max={0.99}
              step={0.05}
              style={{ width: '100%' }}
              formatter={(value) => `${Math.round(value * 100)}%`}
              parser={(value) => parseFloat(value.replace('%', '')) / 100}
            />
          </Form.Item>
          <Form.Item name="auto_escalate" label="超时自动升级" valuePropName="checked">
            <Switch />
          </Form.Item>
          {editingRule && (
            <Form.Item name="is_active" label="启用状态" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
