import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Modal, Form, Input, Select, Switch, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { rulesAPI } from '../services/api';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await rulesAPI.list();
      setRules(res.data);
    } catch (err) {
      message.error('获取规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAdd = () => {
    setEditingRule(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    form.setFieldsValue(rule);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await rulesAPI.delete(id);
      message.success('删除成功');
      fetchRules();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingRule) {
        await rulesAPI.update(editingRule.id, values);
        message.success('更新成功');
      } else {
        await rulesAPI.create(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchRules();
    } catch (err) {
      message.error(editingRule ? '更新失败' : '创建失败');
    }
  };

  const handleToggleEnabled = async (rule, enabled) => {
    try {
      await rulesAPI.update(rule.id, { ...rule, enabled });
      fetchRules();
      message.success(enabled ? '已启用' : '已禁用');
    } catch (err) {
      message.error('操作失败');
    }
  };

  const getActionTag = (action) => {
    const colors = { pass: 'green', reject: 'red', manual: 'blue' };
    const texts = { pass: '通过', reject: '拒绝', manual: '人工审核' };
    return <Tag color={colors[action]}>{texts[action]}</Tag>;
  };

  const getTypeTag = (type) => {
    const texts = { keyword: '关键词', regex: '正则', length_min: '最小长度', length_max: '最大长度' };
    return <Tag>{texts[type] || type}</Tag>;
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '规则名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'rule_type', width: 120, render: (t) => getTypeTag(t) },
    { title: '匹配模式', dataIndex: 'pattern', ellipsis: true },
    { title: '动作', dataIndex: 'action', width: 100, render: (a) => getActionTag(a) },
    {
      title: '分值',
      dataIndex: 'score',
      width: 80,
      render: (s) => (
        <Tag color={s > 0 ? 'orange' : s < 0 ? 'green' : 'default'}>
          {s > 0 ? `+${s}` : s}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={(v) => handleToggleEnabled(record, v)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      )
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此规则？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>共 {rules.length} 条审核规则</span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchRules}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加规则</Button>
        </Space>
      </div>
      <Table
        dataSource={rules}
        columns={columns}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={editingRule ? '编辑规则' : '添加规则'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="确认"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="请输入规则名称" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="rule_type" label="规则类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select placeholder="选择类型">
                <Option value="keyword">关键词匹配</Option>
                <Option value="regex">正则表达式</Option>
                <Option value="length_min">最小长度</Option>
                <Option value="length_max">最大长度</Option>
              </Select>
            </Form.Item>
            <Form.Item name="action" label="触发动作" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select placeholder="选择动作">
                <Option value="pass">倾向通过</Option>
                <Option value="reject">倾向拒绝</Option>
                <Option value="manual">转人工</Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="pattern" label="匹配模式" rules={[{ required: true }]}>
            <Input placeholder="关键词/正则表达式/长度数值，关键词用|分隔多个" />
          </Form.Item>
          <Form.Item name="score" label="风险分值（正分加风险，负分减风险）" rules={[{ required: true }]}>
            <Input type="number" placeholder="如：10 或 -5" />
          </Form.Item>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item name="description" label="规则描述">
            <TextArea rows={2} placeholder="规则描述说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default RulesPage;
