import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Button, Row, Col, Tag, message } from 'antd';
import { orderApi } from '../../api';

function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    orderApi.getOrder(id).then((res) => {
      setOrder(res.data);
    });
  }, [id]);

  const handleCancel = () => {
    if (order.status !== 'confirmed') {
      message.error('只有已确认的订单可以取消');
      return;
    }
    
    orderApi.updateOrderStatus(order.id, 'cancelled').then(() => {
      message.success('订单已取消');
      setOrder({ ...order, status: 'cancelled' });
    }).catch(() => {
      message.error('取消失败');
    });
  };

  if (!order) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">加载中...</div>;
  }

  const statusInfo = {
    pending: { text: '待确认', color: 'orange' },
    confirmed: { text: '已确认', color: 'green' },
    cancelled: { text: '已取消', color: 'red' },
    completed: { text: '已完成', color: 'gray' },
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Card title="订单详情">
          <div className="flex items-center justify-between mb-6">
            <span className="text-lg font-bold">订单号: {order.order_no}</span>
            <Tag color={statusInfo[order.status].color} className="text-lg">
              {statusInfo[order.status].text}
            </Tag>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="酒店信息">
                <p className="font-bold text-lg">{order.hotel.name}</p>
                <p className="text-gray-500">{order.hotel.city} - {order.hotel.address}</p>
                <p className="mt-2">房型: {order.room.name}</p>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="预订信息">
                <p><span className="text-gray-500">入住人:</span> {order.guest_name}</p>
                <p><span className="text-gray-500">联系电话:</span> {order.guest_phone}</p>
                <p><span className="text-gray-500">邮箱:</span> {order.guest_email}</p>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="入住时间">
                <p><span className="text-gray-500">入住日期:</span> {order.check_in}</p>
                <p><span className="text-gray-500">退房日期:</span> {order.check_out}</p>
                <p><span className="text-gray-500">入住天数:</span> {order.nights}晚</p>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="订单金额">
                <p className="text-3xl font-bold text-red-500">¥{order.total_price}</p>
                <p className="text-gray-500">共{order.nights}晚，¥{order.room.price_per_night}/晚</p>
              </Card>
            </Col>
          </Row>

          {order.special_requests && (
            <Card title="特殊要求" className="mt-6">
              <p>{order.special_requests}</p>
            </Card>
          )}

          <div className="flex justify-center gap-4 mt-8">
            <Button>
              <Link to="/orders">返回订单列表</Link>
            </Button>
            {order.status === 'confirmed' && (
              <Button type="danger" onClick={handleCancel}>
                取消订单
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default OrderDetail;