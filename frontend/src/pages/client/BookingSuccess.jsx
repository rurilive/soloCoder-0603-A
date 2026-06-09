import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Button, Row, Col, CheckCircle } from 'antd';
import { orderApi } from '../../api';

function BookingSuccess() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    orderApi.getOrder(id).then((res) => {
      setOrder(res.data);
    });
  }, [id]);

  if (!order) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white py-12 text-center">
            <CheckCircle className="text-6xl mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">预订成功！</h1>
            <p className="text-green-100">您的订单已确认，请注意查收确认邮件</p>
          </div>

          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">订单详情</h2>
              <span className="bg-blue-100 text-blue-600 px-4 py-2 rounded-full text-sm font-medium">
                订单号: {order.order_no}
              </span>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="酒店信息">
                  <p className="font-bold text-lg">{order.hotel.name}</p>
                  <p className="text-gray-500">{order.hotel.city} - {order.hotel.address}</p>
                  <p className="mt-2 font-medium">房型: {order.room.name}</p>
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
                <Card title="订单状态">
                  <p className="text-lg font-bold">
                    {order.status === 'confirmed' ? (
                      <span className="text-green-600">已确认</span>
                    ) : order.status === 'pending' ? (
                      <span className="text-yellow-600">待确认</span>
                    ) : order.status === 'cancelled' ? (
                      <span className="text-red-600">已取消</span>
                    ) : (
                      <span className="text-gray-600">已完成</span>
                    )}
                  </p>
                  <p className="text-2xl font-bold text-red-500 mt-4">¥{order.total_price}</p>
                  <p className="text-gray-500 text-sm">共{order.nights}晚</p>
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
                <Link to="/">继续预订</Link>
              </Button>
              <Button type="primary">
                <Link to="/orders">查看我的订单</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookingSuccess;