import React from 'react';
import { Card, Row, Col, Statistic, Progress, Tag } from 'antd';
import {
  FileTextOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  UserOutlined
} from '@ant-design/icons';

function DashboardPage({ stats }) {
  const autoTotal = (stats.auto_passed || 0) + (stats.auto_rejected || 0);
  const totalWithManual = autoTotal + (stats.manual || 0);
  const autoRate = totalWithManual > 0 ? Math.round((autoTotal / totalWithManual) * 100) : 0;
  const manualRate = totalWithManual > 0 ? Math.round(((stats.manual || 0) / totalWithManual) * 100) : 0;
  const passRate = stats.total > 0 ? Math.round(((stats.approved || 0) / stats.total) * 100) : 0;
  const rejectRate = stats.total > 0 ? Math.round(((stats.rejected || 0) / stats.total) * 100) : 0;

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
        <Col xs={24}>
          <Card title="系统说明">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <h4><Tag color="blue">自动审核流程</Tag></h4>
                <ol>
                  <li>内容提交后自动进入审核引擎</li>
                  <li>根据配置的规则计算风险分</li>
                  <li>风险分 ≤ -5：自动通过</li>
                  <li>风险分 ≥ 5：自动拒绝</li>
                  <li>其他情况：进入人工审核队列</li>
                </ol>
              </Col>
              <Col xs={24} md={8}>
                <h4><Tag color="green">人工审核操作</Tag></h4>
                <ul>
                  <li>查看内容详情和自动审核结果</li>
                  <li>执行通过/拒绝操作</li>
                  <li>为内容打标签分类</li>
                  <li>记录审核备注</li>
                </ul>
              </Col>
              <Col xs={24} md={8}>
                <h4><Tag color="orange">规则管理</Tag></h4>
                <ul>
                  <li>关键词匹配规则</li>
                  <li>正则表达式规则</li>
                  <li>内容长度规则</li>
                  <li>可调整规则分值和启用状态</li>
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
