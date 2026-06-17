import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Statistic,
  Button,
  Row,
  Col,
  DatePicker,
  Space,
  Progress,
  Tooltip,
  Spin,
  Alert,
  Typography,
  Empty
} from 'antd';
import {
  TrophyOutlined,
  FileDoneOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  AimOutlined,
  ExceptionOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { performanceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

function formatDuration(seconds) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}时${m}分`;
}

function getAccuracyColor(rate) {
  if (rate == null) return 'default';
  if (rate >= 0.9) return 'green';
  if (rate >= 0.75) return 'orange';
  return 'red';
}

function getAccuracyStatus(rate) {
  if (rate == null) return { text: '暂无数据', level: 'default' };
  if (rate >= 0.95) return { text: '优秀', level: 'success' };
  if (rate >= 0.85) return { text: '良好', level: 'success' };
  if (rate >= 0.75) return { text: '合格', level: 'warning' };
  return { text: '需改进', level: 'error' };
}

function ReviewerPerformancePage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      let startDate = null;
      let endDate = null;
      if (dateRange && dateRange.length === 2) {
        startDate = dateRange[0].startOf('day').toISOString();
        endDate = dateRange[1].endOf('day').toISOString();
      }
      const res = await performanceAPI.getReviewerPerformance(startDate, endDate);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || '获取绩效数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const reviewers = data?.reviewers || [];

  const totalReviewed = reviewers.reduce((s, r) => s + (r.total_reviewed || 0), 0);
  const totalApproved = reviewers.reduce((s, r) => s + (r.approved_count || 0), 0);
  const totalRejected = reviewers.reduce((s, r) => s + (r.rejected_count || 0), 0);
  const totalResubmit = reviewers.reduce((s, r) => s + (r.resubmit_processed || 0), 0);
  const totalSampled = reviewers.reduce((s, r) => s + (r.sampled_count || 0), 0);
  const totalInconsistent = reviewers.reduce((s, r) => s + (r.inconsistent_count || 0), 0);
  const avgAccuracy = totalSampled > 0
    ? ((totalSampled - totalInconsistent) / totalSampled)
    : null;
  const allDurations = reviewers
    .filter((r) => r.total_review_seconds != null)
    .map((r) => r.total_review_seconds);
  const totalDuration = allDurations.reduce((s, d) => s + d, 0);
  const avgReviewAvg = totalReviewed > 0
    ? Math.round(totalDuration / Math.max(1, totalReviewed))
    : null;

  const columns = [
    {
      title: '审核员',
      dataIndex: 'display_name',
      key: 'display_name',
      fixed: 'left',
      width: 140,
      render: (text, record) => (
        <Space>
          <Tag color="blue" icon={<TeamOutlined />}>
            {text || record.username}
          </Tag>
        </Space>
      ),
      sorter: (a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username)
    },
    {
      title: (
        <span>
          <FileDoneOutlined style={{ marginRight: 4 }} />
          审核总数
        </span>
      ),
      dataIndex: 'total_reviewed',
      key: 'total_reviewed',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.total_reviewed - b.total_reviewed,
      render: (v) => <b style={{ fontSize: 15 }}>{v || 0}</b>
    },
    {
      title: (
        <span>
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />
          通过
        </span>
      ),
      dataIndex: 'approved_count',
      key: 'approved_count',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.approved_count - b.approved_count,
      render: (v, row) => {
        const pct = row.total_reviewed > 0 ? Math.round(((v || 0) / row.total_reviewed) * 100) : 0;
        return (
          <Tooltip title={`通过率 ${pct}%`}>
            <span style={{ color: '#52c41a' }}>{v || 0}</span>
          </Tooltip>
        );
      }
    },
    {
      title: (
        <span>
          <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
          拒绝
        </span>
      ),
      dataIndex: 'rejected_count',
      key: 'rejected_count',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.rejected_count - b.rejected_count,
      render: (v, row) => {
        const pct = row.total_reviewed > 0 ? Math.round(((v || 0) / row.total_reviewed) * 100) : 0;
        return (
          <Tooltip title={`拒绝率 ${pct}%`}>
            <span style={{ color: '#ff4d4f' }}>{v || 0}</span>
          </Tooltip>
        );
      }
    },
    {
      title: (
        <span>
          <ThunderboltOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
          重提处理
        </span>
      ),
      dataIndex: 'resubmit_processed',
      key: 'resubmit_processed',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.resubmit_processed - b.resubmit_processed,
      render: (v) => <Tag color="orange">{v || 0}</Tag>
    },
    {
      title: (
        <span>
          <AimOutlined style={{ marginRight: 4 }} />
          准确率
        </span>
      ),
      dataIndex: 'accuracy_rate',
      key: 'accuracy_rate',
      width: 170,
      render: (v, row) => {
        const status = getAccuracyStatus(v);
        const pct = v != null ? (v * 100).toFixed(1) : null;
        const accColor = getAccuracyColor(v);
        return (
          <div>
            <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Tag color={accColor} icon={<TrophyOutlined />}>
                {pct != null ? `${pct}%` : '-'}
              </Tag>
              {v != null && (
                <Tag
                  color={
                    status.level === 'success' ? 'green' : status.level === 'warning' ? 'orange' : 'red'
                  }
                >
                  {status.text}
                </Tag>
              )}
            </Space>
            {v != null && (
              <Progress
                percent={Number(pct)}
                size="small"
                showInfo={false}
                strokeColor={accColor}
              />
            )}
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              抽样 {row.sampled_count || 0} 条，
              <span style={{ color: row.inconsistent_count > 0 ? '#ff4d4f' : '#52c41a' }}>
                不一致 {row.inconsistent_count || 0} 条
              </span>
            </div>
          </div>
        );
      },
      sorter: (a, b) => (a.accuracy_rate ?? -1) - (b.accuracy_rate ?? -1)
    },
    {
      title: (
        <span>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          平均审核时间
        </span>
      ),
      dataIndex: 'avg_review_seconds',
      key: 'avg_review_seconds',
      width: 140,
      align: 'right',
      render: (v, row) => (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {formatDuration(v != null ? Math.round(v) : null)}
          </div>
          {row.total_review_seconds != null && (
            <div style={{ fontSize: 12, color: '#888' }}>
              总计 {formatDuration(row.total_review_seconds)}
            </div>
          )}
        </div>
      ),
      sorter: (a, b) => (a.avg_review_seconds ?? 999999) - (b.avg_review_seconds ?? 999999)
    }
  ];

  const overallColor = getAccuracyColor(avgAccuracy);

  return (
    <div>
      {!isAdmin && (
        <Alert
          message="权限提示"
          description="审核员绩效统计仅管理员可见"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <span>审核员绩效统计</span>
            {data?.period_start && data.period_end && (
              <Tag color="blue" icon={<CalendarOutlined />}>
                {dayjs(data.period_start).format('YYYY-MM-DD')} ~ {dayjs(data.period_end).format('YYYY-MM-DD')}
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              allowClear
              placeholder={['开始日期', '结束日期']}
            />
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
            >
              查询
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="团队审核总数"
                value={totalReviewed}
                prefix={<FileDoneOutlined style={{ color: '#1890ff' }} />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="通过 / 拒绝"
                value={`${totalApproved} / ${totalRejected}`}
                prefix={
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  </Space>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="团队整体准确率"
                value={avgAccuracy != null ? `${(avgAccuracy * 100).toFixed(1)}%` : '-'}
                prefix={
                  <AimOutlined
                    style={{
                      color:
                        avgAccuracy == null
                          ? '#999'
                          : overallColor === 'green'
                            ? '#52c41a'
                            : overallColor === 'orange'
                              ? '#faad14'
                              : '#ff4d4f'
                    }}
                  />
                }
                valueStyle={{
                  color:
                    avgAccuracy == null
                      ? '#999'
                      : overallColor === 'green'
                        ? '#52c41a'
                        : overallColor === 'orange'
                          ? '#faad14'
                          : '#ff4d4f'
                }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                抽样 {totalSampled} 条，不一致 {totalInconsistent} 条
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="团队平均审核时间"
                value={formatDuration(avgReviewAvg)}
                prefix={<ClockCircleOutlined style={{ color: '#722ed1' }} />}
                valueStyle={{ color: '#722ed1' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                重提处理 {totalResubmit} 条
              </div>
            </Card>
          </Col>
        </Row>

        {error && (
          <Alert
            message="数据加载失败"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Spin spinning={loading}>
          {isAdmin ? (
            <Table
              columns={columns}
              dataSource={reviewers}
              rowKey="username"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 位审核员`
              }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: <Empty description="暂无绩效数据" />
              }}
              bordered
              size="middle"
            />
          ) : (
            <Empty description="您没有权限查看此页面" />
          )}
        </Spin>

        <div style={{ marginTop: 24, padding: 16, background: '#f9f9ff', borderRadius: 8 }}>
          <Title level={5} style={{ marginTop: 0 }}>
            <ExceptionOutlined style={{ marginRight: 8 }} />
            指标说明
          </Title>
          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Text type="secondary">
                <b>审核数量：</b>审核员在指定时间段内完成审核的内容总数（通过+拒绝）
              </Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary">
                <b>准确率：</b>基于抽样复审的一致率，计算方式：(抽样总数-不一致数)/抽样总数
              </Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary">
                <b>平均审核时间：</b>从内容分配（或创建）到审核完成的平均耗时
              </Text>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary">
                <b>重提处理：</b>审核被打回修改后重新提交的内容数量
              </Text>
            </Col>
          </Row>
        </div>
      </Card>
    </div>
  );
}

export default ReviewerPerformancePage;
