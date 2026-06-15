import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Empty, Space } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentAPI } from '../services/api';

function RejectedPage() {
  const navigate = useNavigate();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchContents = async () => {
    setLoading(true);
    try {
      const res = await contentAPI.list('rejected');
      setContents(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContents();
  }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (text, record) => (
        <a onClick={() => navigate(`/content/${record.id}`)}>{text}</a>
      )
    },
    { title: '作者', dataIndex: 'author', width: 100 },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 200,
      render: (tags) => (
        <Space wrap>
          {tags?.map((tag, i) => <Tag key={i}>{tag}</Tag>)}
        </Space>
      )
    },
    {
      title: '审核方式',
      dataIndex: 'reviewed_by',
      width: 120,
      render: (by, record) => (
        record.auto_review_result === 'auto_reject'
          ? <Tag color="red">自动拒绝</Tag>
          : <Tag color="orange">人工审核</Tag>
      )
    },
    { title: '审核人', dataIndex: 'reviewed_by', width: 100 },
    {
      title: '审核时间',
      dataIndex: 'reviewed_at',
      width: 180,
      render: (t) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/content/${record.id}`)}>
          详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>共 {contents.length} 条已拒绝内容</span>
        <Button icon={<ReloadOutlined />} onClick={fetchContents}>刷新</Button>
      </div>
      <Table
        dataSource={contents}
        columns={columns}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: <Empty description="暂无已拒绝内容" /> }}
      />
    </div>
  );
}

export default RejectedPage;
