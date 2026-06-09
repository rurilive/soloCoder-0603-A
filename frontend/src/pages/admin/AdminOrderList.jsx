import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, message, Select, Modal, Form } from 'antd';
import { orderApi } from '../../api';

const { Option } = Select;

function AdminOrderList() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    orderApi.getOrders({ status: statusFilter || undefined }).then((res) => {
      setOrders(res.data);
    });
  }, [statusFilter]);

  const handleStatusChange = (order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setModalVisible(true);
    form.setFieldsValue({ status: order.status });
  };

  const confirmStatusChange = () => {
    if (selectedOrder && newStatus !== selectedOrder.status) {
      orderApi.updateOrderStatus(selectedOrder.id, newStatus).then(() => {
        message.success('状态更新成功');
        setOrders(orders.map((o) => 
          o.id === selectedOrder.id ? { ...o, status: newStatus } : o
        ));
      }).catch(() => {
        message.error('更新失败');
      });
    }
    setModalVisible(false);
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
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
      title: '联系电话',
      dataIndex: 'guest_phone',
      key: 'guest_phone',
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
      title: '总价',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price) => <span className="text-red-500 font-bold">¥{price}</span>,
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
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" onClick={() => handleStatusChange(record)}>
          修改状态
        </Button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">订单管理</h2>
          <Select
            placeholder="按状态筛选"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            className="w-40"
          >
            <Option value="">全部状态</Option>
            <Option value="pending">待确认</Option>
            <Option value="confirmed">已确认</Option>
            <Option value="cancelled">已取消</Option>
            <Option value="completed">已完成</Option>
          </Select>
        </div>

        <Card>
          <Table
            dataSource={orders}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            emptyText="暂无订单"
          />
        </Card>
      </div>

      <Modal
        title="修改订单状态"
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="back" onClick={() => setModalVisible(false)}>取消</Button>,
          <Button key="submit" type="primary" onClick={confirmStatusChange}>确认修改</Button>,
        ]}
      >
        {selectedOrder && (
          <div>
            <p className="mb-4">订单号: {selectedOrder.order_no}</p>
            <Form form={form} layout="vertical">
              <Form.Item name="status" label="订单状态">
                <Select onChange={(value) => setNewStatus(value)}>
                  <Option value="pending">待确认</Option>
                  <Option value="confirmed">已确认</Option>
                  <Option value="cancelled">已取消</Option>
                  <Option value="completed">已完成</Option>
                </Select>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AdminOrderList;