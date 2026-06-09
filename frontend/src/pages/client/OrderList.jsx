import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Table, Tag, Button } from 'antd';
import { orderApi } from '../../api';

function OrderList() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    orderApi.getOrders().then((res) => {
      setOrders(res.data);
    });
  }, []);

  const columns = [
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
      render: (text) => <Link to={`/orders/${text}`}>{text}</Link>,
    },
    {
      title: '酒店',
      dataIndex: 'hotel',
      key: 'hotel',
      render: (hotel) => hotel?.name || '-',
    },
    {
      title: '房型',
      dataIndex: 'room',
      key: 'room',
      render: (room) => room?.name || '-',
    },
    {
      title: '入住人',
      dataIndex: 'guest_name',
      key: 'guest_name',
    },
    {
      title: '入住日期',
      dataIndex: 'check_in',
      key: 'check_in',
    },
    {
      title: '退房日期',
      dataIndex: 'check_out',
      key: 'check_out',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const color = {
          pending: 'orange',
          confirmed: 'green',
          cancelled: 'red',
          completed: 'gray',
        };
        const text = {
          pending: '待确认',
          confirmed: '已确认',
          cancelled: '已取消',
          completed: '已完成',
        };
        return <Tag color={color[status]}>{text[status]}</Tag>;
      },
    },
    {
      title: '总价',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price) => <span className="font-bold text-red-500">¥{price}</span>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link">
          <Link to={`/orders/${record.id}`}>查看详情</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <Card title="我的订单">
          <Table
            dataSource={orders}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            emptyText="暂无订单"
          />
        </Card>
      </div>
    </div>
  );
}

export default OrderList;