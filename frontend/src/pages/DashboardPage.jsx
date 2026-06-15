import React from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, Descriptions } from 'antd';
import {
  FileTextOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  UserOutlined,
  ExperimentOutlined,
  AuditOutlined
} from '@ant-design/icons';

function DashboardPage({ stats }) {
  const autoTotal = (stats.auto_passed || 0) + (stats.auto_rejected || 0);
  const totalWithManual = autoTotal + (stats.manual || 0);
  const autoRate = totalWithManual > 0 ? Math.round((autoTotal / totalWithManual) * 100) : 0;
  const manualRate = totalWithManual > 0 ? Math.round(((stats.manual || 0) / totalWithManual) * 100) : 0;
  const passRate = stats.total > 0 ? Math.round(((stats.approved || 0) / stats.total) * 100) : 0;
  const rejectRate = stats.total > 0 ? Math.round(((stats.rejected || 0) / stats.total) * 100) : 0;
  const mlRate = stats.total > 0 ? Math.round(((stats.ml_processed || 0) / stats.total) * 100) : 0;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="内容总数"
              value={stats.total || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="待审核"
              value={stats.pending || 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已通过"
              value={stats.approved || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已拒绝"
              value={stats.rejected || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="审核方式分布">
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span><RobotOutlined style={{ marginRight: 8 }} />自动审核处理</span>
                <span><Tag color="green">自动通过 {stats.auto_passed || 0}</Tag> <Tag color="red">自动拒绝 {stats.auto_rejected || 0}</Tag></span>
              </div>
              <Progress percent={autoRate} strokeColor="#1890ff" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span><UserOutlined style={{ marginRight: 8 }} />人工审核处理</span>
                <span><Tag color="blue">需人工 {stats.manual || 0}</Tag></span>
              </div>
              <Progress percent={manualRate} strokeColor="#722ed1" />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="审核结果分布">
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>通过率</span>
                <span>{passRate}%</span>
              </div>
              <Progress percent={passRate} strokeColor="#52c41a" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>拒绝率</span>
                <span>{rejectRate}%</span>
              </div>
              <Progress percent={rejectRate} strokeColor="#ff4d4f" />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="ML模型审核覆盖"
              value={stats.ml_processed || 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ExperimentOutlined />}
              suffix={`/ ${stats.total || 0}`}
            />
            <Progress
              percent={mlRate}
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
              style={{ marginTop: 8 }}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="抽样批次"
              value={stats.sample_batches || 0}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
            <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
              已抽样 {stats.total_sampled || 0} 条，已复审 {stats.reviewed_samples || 0} 条
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="抽样一致率"
              value={stats.sample_consistency_rate != null ? (stats.sample_consistency_rate * 100).toFixed(1) : '-'}
              suffix={stats.sample_consistency_rate != null ? '%' : ''}
              valueStyle={{
                color: stats.sample_consistency_rate >= 0.8 ? '#52c41a'
                  : stats.sample_consistency_rate >= 0.6 ? '#faad14'
                  : '#ff4d4f'
              }}
              prefix={<Tag color="blue">质量</Tag>}
            />
            <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
              {stats.sample_consistency_rate == null ? '暂无复审数据' :
                stats.sample_consistency_rate >= 0.8 ? '模型质量优秀' :
                stats.sample_consistency_rate >= 0.6 ? '模型质量良好' :
                '建议检查并调整阈值'}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="系统说明">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={6}>
                <h4><Tag color="blue">自动审核流程</Tag></h4>
                <ol>
                  <li>内容提交后进入双引擎审核</li>
                  <li>规则引擎：匹配规则计算风险分</li>
                  <li>ML模型：HTTP API调用获取分类分</li>
                  <li>按权重加权混合两路分数</li>
                  <li>与通过/拒绝阈值比较出结果</li>
                </ol>
              </Col>
              <Col xs={24} md={6}>
                <h4><Tag color="purple">ML模型集成</Tag></h4>
                <ul>
                  <li>独立HTTP服务 (端口1112)</li>
                  <li>输出6类风险分 + 总体分</li>
                  <li>可配置通过/拒绝阈值</li>
                  <li>可调整ML/规则权重占比</li>
                  <li>模型调用失败自动降级纯规则</li>
                </ul>
              </Col>
              <Col xs={24} md={6}>
                <h4><Tag color="cyan">抽样复审机制</Tag></h4>
                <ul>
                  <li>每60秒定时自动抽样 (10%)</li>
                  <li>支持手动触发抽样任务</li>
                  <li>按批次管理抽样任务</li>
                  <li>对比人工与自动审核一致性</li>
                  <li>自动统计模型一致率指标</li>
                </ul>
              </Col>
              <Col xs={24} md={6}>
                <h4><Tag color="orange">规则管理</Tag></h4>
                <ul>
                  <li>关键词匹配规则</li>
                  <li>正则表达式规则</li>
                  <li>内容长度规则</li>
                  <li>可调整规则分值</li>
                  <li>可随时启用/禁用规则</li>
                </ul>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default DashboardPage;
