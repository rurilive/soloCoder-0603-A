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
  Alert,
  Progress,
  Row,
  Col,
  Tabs,
  Empty,
  Collapse
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  TagOutlined,
  HistoryOutlined,
  EditOutlined,
  SwapOutlined,
  BranchesOutlined,
  ClockCircleOutlined,
  FileProtectOutlined,
  DiffOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentAPI, mlThresholdAPI, versionAPI } from '../services/api';

const { TextArea } = Input;
const { Option } = Select;
const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

function DiffView({ diffs }) {
  if (!diffs || diffs.length === 0) {
    return <Empty description="两版本内容完全一致，没有差异" />;
  }

  const renderLineDiff = (oldVal, newVal, type) => {
    const containerStyle = {
      fontFamily: 'monospace',
      fontSize: 13,
      padding: '8px 12px',
      margin: '4px 0',
      borderRadius: 4,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all'
    };
    if (type === 'equal') {
      return <div style={{ ...containerStyle, background: '#fff' }}>{oldVal || newVal}</div>;
    }
    if (type === 'insert') {
      return (
        <div style={{ ...containerStyle, background: '#f6ffed', borderLeft: '4px solid #52c41a' }}>
          <PlusOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          <span style={{ color: '#389e0d' }}>{newVal}</span>
        </div>
      );
    }
    if (type === 'delete') {
      return (
        <div style={{ ...containerStyle, background: '#fff1f0', borderLeft: '4px solid #ff4d4f' }}>
          <MinusOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
          <span style={{ color: '#cf1322', textDecoration: 'line-through' }}>{oldVal}</span>
        </div>
      );
    }
    return (
      <div>
        <div style={{ ...containerStyle, background: '#fff1f0', borderLeft: '4px solid #ff4d4f' }}>
          <MinusOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
          <span style={{ color: '#cf1322', textDecoration: 'line-through' }}>{oldVal}</span>
        </div>
        <div style={{ ...containerStyle, background: '#f6ffed', borderLeft: '4px solid #52c41a' }}>
          <PlusOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          <span style={{ color: '#389e0d' }}>{newVal}</span>
        </div>
      </div>
    );
  };

  const fieldDiffs = diffs.filter((d) => d.field !== 'body_lines');
  const bodyDiffs = diffs.filter((d) => d.field === 'body_lines');

  return (
    <div>
      {fieldDiffs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Title level={5} style={{ marginBottom: 12 }}>
            <FileProtectOutlined style={{ color: '#1890ff', marginRight: 8 }} />
            字段级变更
          </Title>
          <List
            bordered
            dataSource={fieldDiffs}
            locale={{ emptyText: '无字段变更' }}
            renderItem={(d) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color="blue">{d.field}</Tag>
                      <Tag
                        color={
                          d.type === 'insert'
                            ? 'green'
                            : d.type === 'delete'
                              ? 'red'
                              : 'orange'
                        }
                      >
                        {d.type === 'insert'
                          ? '新增'
                          : d.type === 'delete'
                            ? '删除'
                            : '修改'}
                      </Tag>
                    </Space>
                  }
                  description={
                    <div style={{ marginTop: 8 }}>
                      {renderLineDiff(d.old_value, d.new_value, d.type)}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}

      {bodyDiffs.length > 0 && (
        <div>
          <Title level={5} style={{ marginBottom: 12 }}>
            <DiffOutlined style={{ color: '#722ed1', marginRight: 8 }} />
            正文行级变更
          </Title>
          <Card size="small" style={{ background: '#fafafa', border: '1px solid #eee' }}>
            {bodyDiffs.map((d, i) => (
              <div key={i}>{renderLineDiff(d.old_value, d.new_value, d.type)}</div>
            ))}
          </Card>
        </div>
      )}

      {diffs.find((d) => d.field === 'body') && bodyDiffs.length === 0 && (
        <div>
          <Title level={5} style={{ marginBottom: 12 }}>
            <DiffOutlined style={{ color: '#722ed1', marginRight: 8 }} />
            正文完整变更
          </Title>
          {(() => {
            const d = diffs.find((x) => x.field === 'body');
            return (
              <Row gutter={16}>
                <Col span={12}>
                  <Card size="small" title={<Tag color="red">原版本</Tag>} style={{ borderColor: '#ffccc7' }}>
                    <Paragraph style={{ whiteSpace: 'pre-wrap', color: '#8b0000' }}>
                      {d.old_value || '(空)'}
                    </Paragraph>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" title={<Tag color="green">新版本</Tag>} style={{ borderColor: '#b7eb8f' }}>
                    <Paragraph style={{ whiteSpace: 'pre-wrap', color: '#135200' }}>
                      {d.new_value || '(空)'}
                    </Paragraph>
                  </Card>
                </Col>
              </Row>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ContentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [logs, setLogs] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState({ visible: false, action: null });
  const [resubmitModalVisible, setResubmitModalVisible] = useState(false);
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState(null);
  const [diffVersions, setDiffVersions] = useState({ oldVersion: 1, newVersion: 2 });
  const [form] = Form.useForm();
  const [resubmitForm] = Form.useForm();
  const [selectedTags, setSelectedTags] = useState([]);
  const [thresholds, setThresholds] = useState({ pass_threshold: 0.3, reject_threshold: 0.7 });
  const [versionsLoading, setVersionsLoading] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const [contentRes, logsRes, thRes] = await Promise.all([
        contentAPI.get(id),
        contentAPI.logs(id),
        mlThresholdAPI.active().catch(() => ({ data: { pass_threshold: 0.3, reject_threshold: 0.7 } }))
      ]);
      setContent(contentRes.data);
      setLogs(logsRes.data);
      if (thRes && thRes.data) {
        setThresholds(thRes.data);
      }
      await fetchVersions();
    } catch (err) {
      message.error('获取内容详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const res = await versionAPI.listVersions(id);
      setVersions(res.data || []);
    } catch (err) {
      console.warn('获取版本历史失败:', err);
    } finally {
      setVersionsLoading(false);
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
      message.success(
        reviewModal.action === 'approve' ? '已通过' : reviewModal.action === 'reject' ? '已拒绝' : '已打标签'
      );
      setReviewModal({ visible: false, action: null });
      fetchDetail();
    } catch (err) {
      message.error('操作失败');
    }
  };

  const handleResubmit = () => {
    if (!content) return;
    resubmitForm.setFieldsValue({
      title: content.title,
      body: content.body,
      image_url: content.image_url,
      author: content.author,
      source: content.source,
      change_summary: '',
      modified_by: ''
    });
    setResubmitModalVisible(true);
  };

  const submitResubmit = async (values) => {
    try {
      await versionAPI.resubmit(id, {
        content_id: Number(id),
        title: values.title,
        body: values.body,
        image_url: values.image_url,
        author: values.author,
        source: values.source,
        change_summary: values.change_summary,
        modified_by: values.modified_by || 'system'
      });
      message.success('内容已修改并重新提交审核');
      setResubmitModalVisible(false);
      fetchDetail();
    } catch (err) {
      message.error(err?.response?.data?.detail || '重新提交失败');
    }
  };

  const handleShowDiff = () => {
    if (!content) return;
    const currentVer = content.version || 1;
    if (versions.length >= 2) {
      setDiffVersions({
        oldVersion: Math.min(...versions.map((v) => v.version_number)),
        newVersion: Math.max(...versions.map((v) => v.version_number))
      });
    } else if (currentVer >= 2) {
      setDiffVersions({ oldVersion: 1, newVersion: currentVer });
    } else {
      setDiffVersions({ oldVersion: 1, newVersion: 1 });
    }
    setDiffData(null);
    setDiffModalVisible(true);
  };

  const runDiff = async () => {
    setDiffLoading(true);
    try {
      const res = await versionAPI.getDiff(id, diffVersions.oldVersion, diffVersions.newVersion);
      setDiffData(res.data);
    } catch (err) {
      message.error(err?.response?.data?.detail || '生成比对失败');
    } finally {
      setDiffLoading(false);
    }
  };

  useEffect(() => {
    if (diffModalVisible && diffVersions && diffVersions.oldVersion && diffVersions.newVersion) {
      runDiff();
    }
  }, [diffModalVisible, diffVersions.oldVersion, diffVersions.newVersion]);

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
    if (score == null) return 'default';
    if (score <= thresholds.pass_threshold) return 'green';
    if (score >= thresholds.reject_threshold) return 'red';
    return 'orange';
  };

  const getMLResultTag = (result) => {
    if (!result) return <Tag color="default">未调用</Tag>;
    const colors = {
      auto_pass: 'green',
      auto_reject: 'red',
      manual: 'blue',
      unavailable: 'default'
    };
    const texts = {
      auto_pass: 'ML建议通过',
      auto_reject: 'ML建议拒绝',
      manual: 'ML建议人工',
      unavailable: 'ML不可用'
    };
    return <Tag color={colors[result]}>{texts[result]}</Tag>;
  };

  const getImageReviewTag = (result, confidence) => {
    if (!result) return null;
    const colors = { safe: 'green', unsafe: 'red', uncertain: 'orange' };
    const texts = { safe: '图片正常', unsafe: '图片违规', uncertain: '图片需人工' };
    return (
      <Tag color={colors[result]}>
        {texts[result]} ({confidence}%)
      </Tag>
    );
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return '-';
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}时${m}分`;
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  if (!content) {
    return <Alert message="内容不存在" type="error" />;
  }

  const currentVersion = content.version || 1;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回列表
        </Button>
      </div>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          {getStatusTag(content.status)}
          {getAutoReviewTag(content.auto_review_result)}
          <Tag color={getScoreColor(content.combined_score)}>
            综合风险分: {((content.combined_score || 0) * 100).toFixed(1)}%
          </Tag>
          {getMLResultTag(content.ml_result)}
          {content.ml_score != null && (
            <Tag color={content.ml_score < 0.3 ? 'green' : content.ml_score > 0.7 ? 'red' : 'blue'}>
              ML评分: {(content.ml_score * 100).toFixed(1)}%
              {content.ml_confidence != null && ` (置信度 ${(content.ml_confidence * 100).toFixed(0)}%)`}
            </Tag>
          )}
          {content.ml_model_version && (
            <Tag color="purple">模型: {content.ml_model_version}</Tag>
          )}
          {content.image_review_result && getImageReviewTag(content.image_review_result, content.image_review_confidence)}
          <Tag color="cyan" icon={<BranchesOutlined />}>
            v{currentVersion}
          </Tag>
          {content.review_duration_seconds != null && (
            <Tag color="geekblue" icon={<ClockCircleOutlined />}>
              审核耗时: {formatDuration(content.review_duration_seconds)}
            </Tag>
          )}
        </Space>

        <Title level={3} style={{ marginTop: 0 }}>{content.title}</Title>

        {content.image_url && (
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <img
              src={content.image_url}
              alt="内容图片"
              style={{
                maxWidth: '100%',
                maxHeight: 400,
                borderRadius: 8,
                border:
                  content.image_review_result === 'unsafe'
                    ? '3px solid #ff4d4f'
                    : content.image_review_result === 'uncertain'
                      ? '3px solid #faad14'
                      : 'none'
              }}
            />
            {content.image_review_result && (
              <div style={{ marginTop: 8 }}>
                <Alert
                  message={
                    content.image_review_result === 'safe'
                      ? '图片审核通过'
                      : content.image_review_result === 'unsafe'
                        ? '图片审核不通过'
                        : '图片需人工审核确认'
                  }
                  type={
                    content.image_review_result === 'safe'
                      ? 'success'
                      : content.image_review_result === 'unsafe'
                        ? 'error'
                        : 'warning'
                  }
                  showIcon
                />
              </div>
            )}
          </div>
        )}

        <Descriptions column={2} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="ID">{content.id}</Descriptions.Item>
          <Descriptions.Item label="作者">{content.author || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{content.source || '-'}</Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {dayjs(content.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {content.image_url && (
            <Descriptions.Item label="图片链接" span={2}>
              <a href={content.image_url} target="_blank" rel="noopener noreferrer">{content.image_url}</a>
            </Descriptions.Item>
          )}
          {content.reviewed_at && (
            <>
              <Descriptions.Item label="审核人">{content.reviewed_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="审核时间">
                {dayjs(content.reviewed_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="版本号" span={2}>
            <Space>
              <Tag color="cyan" icon={<BranchesOutlined />}>当前 v{currentVersion}</Tag>
              {versions.length > 1 && (
                <Button size="small" type="link" icon={<DiffOutlined />} onClick={handleShowDiff}>
                  版本比对
                </Button>
              )}
            </Space>
          </Descriptions.Item>
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

        {content.ml_category_scores && content.ml_category_scores.length > 0 && (
          <Card
            size="small"
            title="ML 分类风险分详情"
            style={{ marginBottom: 24, background: '#f9f9ff' }}
          >
            <Row gutter={[16, 12]}>
              {content.ml_category_scores.map((cat, i) => {
                const pct = Math.round(cat.score * 100);
                const color = pct > 70 ? '#ff4d4f' : pct > 40 ? '#faad14' : '#52c41a';
                const labelMap = {
                  ad: '广告',
                  gambling: '赌博',
                  porn: '色情',
                  violence: '暴力',
                  drugs: '毒品',
                  politics: '政治敏感',
                  image: '图片风险'
                };
                return (
                  <Col xs={24} sm={12} md={8} key={i}>
                    <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <b>{labelMap[cat.category] || cat.category}</b>
                      <span style={{ color }}>{pct}%</span>
                    </div>
                    <Progress percent={pct} strokeColor={color} size="small" showInfo={false} />
                  </Col>
                );
              })}
            </Row>
          </Card>
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

        {content.status === 'rejected' && (
          <>
            <Divider />
            <Alert
              message="内容已被拒绝"
              description={
                <Space>
                  <span>如需修改后重新提交审核，请点击下方按钮</span>
                </Space>
              }
              type="warning"
              showIcon
              action={
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={handleResubmit}
                  size="middle"
                >
                  修改并重新提交
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          </>
        )}
      </Card>

      <Tabs
        style={{ marginTop: 16 }}
        defaultActiveKey="logs"
        items={[
          {
            key: 'logs',
            label: (
              <span>
                <HistoryOutlined style={{ marginRight: 6 }} />
                审核日志 ({logs.length})
              </span>
            ),
            children: (
              <Card>
                <List
                  dataSource={logs}
                  locale={{ emptyText: '暂无审核记录' }}
                  renderItem={(item) => (
                    <List.Item key={item.id}>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag
                              color={
                                item.action.includes('approve')
                                  ? 'green'
                                  : item.action.includes('reject')
                                    ? 'red'
                                    : item.action === 'resubmit'
                                      ? 'orange'
                                      : 'blue'
                              }
                            >
                              {item.action === 'auto_approve'
                                ? '自动通过'
                                : item.action === 'auto_reject'
                                  ? '自动拒绝'
                                  : item.action === 'approve'
                                    ? '人工通过'
                                    : item.action === 'reject'
                                      ? '人工拒绝'
                                      : item.action === 'tag'
                                        ? '打标签'
                                        : item.action === 'assign'
                                          ? '分配任务'
                                          : item.action === 'resubmit'
                                            ? '重新提交'
                                            : item.action === 'sample_review_approve'
                                              ? '抽样复审-通过'
                                              : item.action === 'sample_review_reject'
                                                ? '抽样复审-拒绝'
                                                : item.action}
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
            )
          },
          {
            key: 'versions',
            label: (
              <span>
                <BranchesOutlined style={{ marginRight: 6 }} />
                版本历史 ({versions.length})
              </span>
            ),
            children: (
              <Card
                extra={
                  <Space>
                    {versions.length > 1 && (
                      <Button icon={<DiffOutlined />} onClick={handleShowDiff}>
                        版本比对
                      </Button>
                    )}
                    <Button icon={<ReloadOutlined />} onClick={fetchVersions} loading={versionsLoading}>
                      刷新
                    </Button>
                  </Space>
                }
              >
                <Spin spinning={versionsLoading}>
                  {versions.length === 0 ? (
                    <Empty description="暂无版本记录" />
                  ) : (
                    <Collapse defaultActiveKey={[String(versions[0]?.id)]}>
                      {versions.map((v) => (
                        <Panel
                          key={v.id}
                          header={
                            <Space>
                              <Tag color="cyan" icon={<BranchesOutlined />}>
                                v{v.version_number}
                              </Tag>
                              <Text strong>{v.title}</Text>
                              {v.change_summary && (
                                <Tag color="purple">
                                  <EditOutlined /> {v.change_summary}
                                </Tag>
                              )}
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {v.modified_by && `修改人: ${v.modified_by}  ·  `}
                                {dayjs(v.created_at).format('YYYY-MM-DD HH:mm:ss')}
                              </Text>
                            </Space>
                          }
                        >
                          <Descriptions column={2} size="small">
                            <Descriptions.Item label="版本号">v{v.version_number}</Descriptions.Item>
                            <Descriptions.Item label="修改人">{v.modified_by || '-'}</Descriptions.Item>
                            <Descriptions.Item label="修改说明">{v.change_summary || '-'}</Descriptions.Item>
                            <Descriptions.Item label="创建时间">
                              {dayjs(v.created_at).format('YYYY-MM-DD HH:mm:ss')}
                            </Descriptions.Item>
                            <Descriptions.Item label="作者">{v.author || '-'}</Descriptions.Item>
                            <Descriptions.Item label="来源">{v.source || '-'}</Descriptions.Item>
                            {v.image_url && (
                              <Descriptions.Item label="图片" span={2}>
                                <a href={v.image_url} target="_blank" rel="noopener noreferrer">
                                  {v.image_url}
                                </a>
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                          <Divider style={{ margin: '12px 0' }} />
                          <div>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              <b>标题:</b> {v.title}
                            </Text>
                          </div>
                          <Paragraph
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: 13,
                              background: '#fafafa',
                              padding: 12,
                              borderRadius: 6,
                              marginTop: 8,
                              border: '1px solid #eee'
                            }}
                          >
                            {v.body}
                          </Paragraph>
                        </Panel>
                      ))}
                    </Collapse>
                  )}
                </Spin>
              </Card>
            )
          }
        ]}
      />

      <Modal
        title={
          reviewModal.action === 'approve'
            ? '通过审核'
            : reviewModal.action === 'reject'
              ? '拒绝审核'
              : '打标签'
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
          <Form.Item
            name="note"
            label={
              reviewModal.action === 'reject' ? '拒绝原因（必填，会显示给内容作者）' : '审核备注'
            }
            rules={
              reviewModal.action === 'reject' ? [{ required: true, message: '请输入拒绝原因' }] : []
            }
          >
            <TextArea rows={3} placeholder={reviewModal.action === 'reject' ? '请输入详细的拒绝原因，便于作者修改' : '请输入审核备注'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#fa8c16' }} />
            修改并重新提交审核
          </Space>
        }
        open={resubmitModalVisible}
        onCancel={() => setResubmitModalVisible(false)}
        onOk={() => resubmitForm.submit()}
        okText="提交审核"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Alert
          message="修改提示"
          description="修改内容后将重新进入审核流程，原审核记录会保留，系统将自动重新执行规则引擎和ML审核"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={resubmitForm} layout="vertical" onFinish={submitResubmit}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入标题" maxLength={255} showCount />
          </Form.Item>
          <Form.Item
            name="body"
            label="正文"
            rules={[{ required: true, message: '请输入正文' }]}
          >
            <TextArea rows={8} placeholder="请输入正文内容" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="author" label="作者">
                <Input placeholder="请输入作者名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="source" label="来源">
                <Input placeholder="请输入来源" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="image_url" label="图片URL">
            <Input placeholder="请输入图片链接（可选）" />
          </Form.Item>
          <Form.Item
            name="change_summary"
            label="本次修改说明"
            rules={[{ required: true, message: '请简要说明修改内容' }]}
          >
            <Input placeholder="例如：修改了标题中的敏感词、补充了正文说明" />
          </Form.Item>
          <Form.Item name="modified_by" label="修改人">
            <Input placeholder="请输入修改人姓名（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <DiffOutlined style={{ color: '#722ed1' }} />
            版本比对
          </Space>
        }
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col span={8}>
              <Text strong>旧版本:</Text>
              <Select
                value={diffVersions.oldVersion}
                onChange={(v) => setDiffVersions({ ...diffVersions, oldVersion: v })}
                style={{ width: '100%', marginTop: 8 }}
              >
                {versions.map((v) => (
                  <Option key={v.version_number} value={v.version_number}>
                    v{v.version_number} - {v.change_summary || dayjs(v.created_at).format('MM-DD HH:mm')}
                  </Option>
                ))}
                <Option key={currentVersion} value={currentVersion}>
                  v{currentVersion} - 当前版本
                </Option>
              </Select>
            </Col>
            <Col span={8} style={{ textAlign: 'center' }}>
              <Button icon={<SwapOutlined />} disabled type="dashed">
                对比
              </Button>
            </Col>
            <Col span={8}>
              <Text strong>新版本:</Text>
              <Select
                value={diffVersions.newVersion}
                onChange={(v) => setDiffVersions({ ...diffVersions, newVersion: v })}
                style={{ width: '100%', marginTop: 8 }}
              >
                {versions.map((v) => (
                  <Option key={v.version_number} value={v.version_number}>
                    v{v.version_number} - {v.change_summary || dayjs(v.created_at).format('MM-DD HH:mm')}
                  </Option>
                ))}
                <Option key={currentVersion} value={currentVersion}>
                  v{currentVersion} - 当前版本
                </Option>
              </Select>
            </Col>
          </Row>
        </Card>

        <Spin spinning={diffLoading}>
          {diffData ? (
            <DiffView diffs={diffData.diffs} />
          ) : (
            <Empty description="请选择版本后查看差异" />
          )}
        </Spin>
      </Modal>
    </div>
  );
}

export default ContentDetail;
