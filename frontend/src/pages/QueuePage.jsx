import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Modal, Form, Input, Select, message, Empty,
  Tooltip, Dropdown, Divider, Alert
} from 'antd';
import {
  EyeOutlined, CheckOutlined, CloseOutlined, TagOutlined, ReloadOutlined,
  UserOutlined, TeamOutlined, SelectOutlined, ClearOutlined, ThunderboltOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { TextArea } = Input;
const { Option } = Select;

function QueuePage() {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewModal, setReviewModal] = useState({ visible: false, content: null });
  const [assignModal, setAssignModal] = useState({ visible: false, contentIds: [] });
  const [batchReviewModal, setBatchReviewModal] = useState({ visible: false, action: null });
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [selectedTags, setSelectedTags] = useState([]);
  const [thresholds, setThresholds] = useState({ pass_threshold: 0.3, reject_threshold: 0.7 });
  const [reviewers, setReviewers] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');

  const reviewerName = currentUser?.display_name || currentUser?.username || '审核员';

  useEffect(() => {
    if (!isAdmin && currentUser) {
      setFilterAssignedTo(currentUser.username);
    }
  }, [isAdmin, currentUser]);

  const fetchContents = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params = { status: 'pending' };
      if (isAdmin) {
        if (filterAssignedTo === 'unassigned') {
          params.unassigned_only = true;
        } else if (filterAssignedTo !== 'all') {
          params.assigned_to = filterAssignedTo;
        }
      }
      const res = await contentAPI.list(params);
      setContents(res.data);
    } catch (err) {
      if (err.response?.status !== 401) {
        message.error('获取待审内容失败');
      }
    } finally {
      setLoading(false);
    }
  }, [filterAssignedTo, currentUser, isAdmin]);

  const fetchThresholds = async () => {
    try {
      const mlThresholdAPI = (await import('../services/api')).mlThresholdAPI;
      const res = await mlThresholdAPI.active();
      setThresholds(res.data);
    } catch (err) {
    }
  };

  const fetchReviewers = async () => {
    try {
      const res = await userAPI.listReviewers();
      setReviewers(res.data);
    } catch (err) {
    }
  };

  useEffect(() => {
    fetchContents();
    fetchThresholds();
    fetchReviewers();
    const interval = setInterval(fetchContents, 10000);
    return () => clearInterval(interval);
  }, [fetchContents]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedRowKeys(contents.map(c => c.id));
        message.info(`已全选 ${contents.length} 条内容`);
        return;
      }

      if (e.key === 'Escape') {
        if (selectedRowKeys.length > 0) {
          setSelectedRowKeys([]);
          message.info('已取消选择');
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (selectedRowKeys.length > 0) {
          handleBatchReview('approve');
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (selectedRowKeys.length > 0) {
          handleBatchReview('reject');
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        if (contents.length > 0) {
          const currentIdx = contents.findIndex(c => c.id === selectedRowKeys[selectedRowKeys.length - 1]);
          const nextIdx = currentIdx < contents.length - 1 ? currentIdx + 1 : 0;
          if (e.shiftKey) {
            setSelectedRowKeys(prev => {
              if (prev.includes(contents[nextIdx].id)) return prev;
              return [...prev, contents[nextIdx].id];
            });
          } else {
            setSelectedRowKeys([contents[nextIdx].id]);
          }
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (contents.length > 0) {
          const currentIdx = contents.findIndex(c => c.id === selectedRowKeys[selectedRowKeys.length - 1]);
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : contents.length - 1;
          if (e.shiftKey) {
            setSelectedRowKeys(prev => {
              if (prev.includes(contents[prevIdx].id)) return prev;
              return [...prev, contents[prevIdx].id];
            });
          } else {
            setSelectedRowKeys([contents[prevIdx].id]);
          }
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (selectedRowKeys.length === 1) {
          const content = contents.find(c => c.id === selectedRowKeys[0]);
          if (content) handleReview(content, 'approve');
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (selectedRowKeys.length === 1) {
          const content = contents.find(c => c.id === selectedRowKeys[0]);
          if (content) handleReview(content, 'reject');
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (selectedRowKeys.length === 1) {
          const content = contents.find(c => c.id === selectedRowKeys[0]);
          if (content) handleReview(content, 'tag');
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (selectedRowKeys.length === 1) {
          navigate(`/content/${selectedRowKeys[0]}`);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        fetchContents();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contents, selectedRowKeys, navigate, fetchContents]);

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
        reviewer: reviewerName
      });
      message.success(reviewModal.action === 'approve' ? '已通过' : reviewModal.action === 'reject' ? '已拒绝' : '已打标签');
      setReviewModal({ visible: false, content: null });
      setSelectedRowKeys(prev => prev.filter(id => id !== reviewModal.content.id));
      fetchContents();
    } catch (err) {
      if (err.response?.status === 403) {
        message.error('无权审核该内容');
      } else if (err.response?.status !== 401) {
        message.error('审核失败');
      }
    }
  };

  const handleBatchReview = (action) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择内容');
      return;
    }
    setBatchReviewModal({ visible: true, action });
    batchForm.resetFields();
  };

  const submitBatchReview = async (values) => {
    try {
      const res = await contentAPI.batchReview({
        content_ids: selectedRowKeys,
        action: batchReviewModal.action,
        note: values.note,
        tags: [],
        reviewer: reviewerName
      });
      let msg = `批量${batchReviewModal.action === 'approve' ? '通过' : '拒绝'}成功：${res.data.success} 条`;
      if (res.data.failed > 0) {
        msg += `，失败 ${res.data.failed} 条（可能无权操作）`;
      }
      message.success(msg);
      setBatchReviewModal({ visible: false, action: null });
      setSelectedRowKeys([]);
      fetchContents();
    } catch (err) {
      if (err.response?.status !== 401) {
        message.error('批量操作失败');
      }
    }
  };

  const handleAssign = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择内容');
      return;
    }
    setAssignModal({ visible: true, contentIds: selectedRowKeys });
    assignForm.resetFields();
  };

  const submitAssign = async (values) => {
    try {
      const res = await contentAPI.assign({
        content_ids: assignModal.contentIds,
        assigned_to: values.assigned_to,
        assigned_by: reviewerName
      });
      message.success(`分配成功：${res.data.success} 条，失败 ${res.data.failed} 条`);
      setAssignModal({ visible: false, contentIds: [] });
      setSelectedRowKeys([]);
      fetchContents();
    } catch (err) {
      if (err.response?.status === 403) {
        message.error('需要管理员权限');
      } else if (err.response?.status !== 401) {
        message.error('分配失败');
      }
    }
  };

  const getAutoReviewInfo = (record) => {
    const score = record.combined_score;
    let color = 'default';
    if (score != null) {
      if (score <= thresholds.pass_threshold) color = 'green';
      else if (score >= thresholds.reject_threshold) color = 'red';
      else color = 'orange';
    }
    return (
      <Space size="small" wrap>
        <Tag color={color}>
          综合分: {score != null ? `${(score * 100).toFixed(1)}%` : '-'}
        </Tag>
        {record.auto_review_result === 'manual' && <Tag color="blue">需人工审核</Tag>}
        {record.image_review_result === 'unsafe' && <Tag color="red">图片违规</Tag>}
        {record.image_review_result === 'uncertain' && <Tag color="orange">图片需人工</Tag>}
        {record.image_review_result === 'safe' && <Tag color="green">图片正常</Tag>}
      </Space>
    );
  };

  const getAssignedTag = (assignedTo) => {
    if (!assignedTo) {
      return <Tag icon={<UserOutlined />} color="default">未分配</Tag>;
    }
    const reviewer = reviewers.find(r => r.username === assignedTo);
    const displayName = reviewer?.display_name || assignedTo;
    return <Tag icon={<TeamOutlined />} color="blue">{displayName}</Tag>;
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    preserveSelectedRowKeys: true
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
      title: '分配给',
      dataIndex: 'assigned_to',
      width: 120,
      render: (assignedTo) => getAssignedTag(assignedTo)
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
      fixed: 'right',
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

  const shortcutsMenu = {
    items: [
      { key: '1', label: 'Ctrl + A — 全选' },
      { key: '2', label: 'Ctrl + Enter — 批量通过' },
      { key: '3', label: 'Ctrl + Shift + Enter — 批量拒绝' },
      { key: '4', label: 'J / K — 下/上移动选择 (Shift 多选)' },
      { key: '5', label: 'A / S / D — 单条通过/拒绝/打标签' },
      { key: '6', label: 'V — 查看详情' },
      { key: '7', label: 'R — 刷新列表' },
      { key: '8', label: 'Esc — 取消选择' }
    ]
  };

  return (
    <div>
      {!isAdmin && currentUser && (
        <Alert
          message={
            <Space>
              <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
              <span>审核员视图：仅显示分配给 <strong>{reviewerName}</strong> 的待审任务</span>
            </Space>
          }
          type="info"
          showIcon={false}
          style={{ marginBottom: 16, borderRadius: 6 }}
        />
      )}

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space size="middle" wrap>
          <span style={{ fontWeight: 500 }}>
            共 {contents.length} 条待审核内容
            {selectedRowKeys.length > 0 && (
              <span style={{ color: '#1890ff', marginLeft: 8 }}>
                已选 {selectedRowKeys.length} 条
              </span>
            )}
          </span>
          {isAdmin && (
            <Select
              style={{ width: 180 }}
              value={filterAssignedTo}
              onChange={(val) => {
                setFilterAssignedTo(val);
                setSelectedRowKeys([]);
              }}
              placeholder="按分配筛选"
            >
              <Option value="all">全部内容</Option>
              <Option value="unassigned">未分配</Option>
              {reviewers.map(r => (
                <Option key={r.username} value={r.username}>
                  {r.display_name || r.username}
                </Option>
              ))}
            </Select>
          )}
        </Space>

        <Space size="small" wrap>
          <Tooltip title="快捷键列表">
            <Dropdown menu={shortcutsMenu} placement="bottomRight">
              <Button icon={<ThunderboltOutlined />}>快捷键</Button>
            </Dropdown>
          </Tooltip>
          <Tooltip title="刷新 (R)">
            <Button icon={<ReloadOutlined />} onClick={fetchContents}>刷新</Button>
          </Tooltip>
          {selectedRowKeys.length > 0 && (
            <>
              <Button icon={<ClearOutlined />} onClick={() => setSelectedRowKeys([])}>
                取消选择
              </Button>
              <Divider type="vertical" />
              <Tooltip title="批量通过 (Ctrl+Enter)">
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleBatchReview('approve')}
                >
                  批量通过 ({selectedRowKeys.length})
                </Button>
              </Tooltip>
              <Tooltip title="批量拒绝 (Ctrl+Shift+Enter)">
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleBatchReview('reject')}
                >
                  批量拒绝 ({selectedRowKeys.length})
                </Button>
              </Tooltip>
              {isAdmin && (
                <Tooltip title="分配给审核员">
                  <Button
                    icon={<UserOutlined />}
                    onClick={handleAssign}
                  >
                    分配任务 ({selectedRowKeys.length})
                  </Button>
                </Tooltip>
              )}
            </>
          )}
        </Space>
      </div>

      <Table
        dataSource={contents}
        columns={columns}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: <Empty description="暂无待审核内容" /> }}
        rowSelection={rowSelection}
        scroll={{ x: 1200 }}
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
            <Form form={form} layout="vertical" onFinish={submitReview} initialValues={{ reviewer: reviewerName }}>
              <Form.Item name="reviewer" label="审核员">
                <Input placeholder="请输入审核员姓名" disabled={!isAdmin} />
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

      <Modal
        title={`批量${batchReviewModal.action === 'approve' ? '通过' : '拒绝'}审核`}
        open={batchReviewModal.visible}
        onCancel={() => setBatchReviewModal({ visible: false, action: null })}
        onOk={() => batchForm.submit()}
        okText="确认批量操作"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
          <div><strong>操作:</strong> {batchReviewModal.action === 'approve' ? '批量通过' : '批量拒绝'}</div>
          <div style={{ marginTop: 4 }}><strong>数量:</strong> {selectedRowKeys.length} 条内容</div>
          <div style={{ marginTop: 4, color: '#fa8c16' }}>⚠️ 此操作不可撤销，请确认后执行</div>
        </div>
        <Form form={batchForm} layout="vertical" onFinish={submitBatchReview} initialValues={{ reviewer: reviewerName }}>
          <Form.Item name="reviewer" label="审核员">
            <Input placeholder="请输入审核员姓名" disabled={!isAdmin} />
          </Form.Item>
          <Form.Item name="note" label="审核备注（可选）">
            <TextArea rows={3} placeholder="请输入批量审核备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="分配审核任务"
        open={assignModal.visible}
        onCancel={() => setAssignModal({ visible: false, contentIds: [] })}
        onOk={() => assignForm.submit()}
        okText="确认分配"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
          <div><strong>待分配内容数量:</strong> {assignModal.contentIds.length} 条</div>
        </div>
        <Form form={assignForm} layout="vertical" onFinish={submitAssign}>
          <Form.Item
            name="assigned_to"
            label="选择审核员"
            rules={[{ required: true, message: '请选择审核员' }]}
          >
            <Select placeholder="请选择要分配的审核员">
              {reviewers.map(r => (
                <Option key={r.username} value={r.username}>
                  {r.display_name || r.username} ({r.username})
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default QueuePage;
