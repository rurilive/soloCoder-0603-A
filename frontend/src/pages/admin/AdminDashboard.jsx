import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Row, Col, Statistic, Button } from 'antd';
import { Hotel, ShoppingCart, Users, DollarSign } from '@ant-design/icons';
import { statsApi, orderApi, hotelApi } from '../../api';

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentHotels, setRecentHotels] = useState([]);

  useEffect(() => {
    statsApi.getStats().then((res) => {
      setStats(res.data);
    });
    
    orderApi.getOrders({ limit: 5 }).then((res) => {
      setRecentOrders(res.data);
    });
    
    hotelApi.getHotels({ limit: 5 }).then((res) => {
      setRecentHotels(res.data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">仪表盘</h2>
        </div>

        <Row gutter={[16, 16]} className="mb-8">
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="总订单数"
                value={stats?.total_orders || 0}
                prefix={<ShoppingCart className="text-blue-500" />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="总收入"
                value={stats?.total_revenue || 0}
                prefix={<DollarSign className="text-green-500" />}
                suffix="元"
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="酒店数量"
                value={recentHotels.length}
                prefix={<Hotel className="text-purple-500" />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="待处理订单"
                value={stats?.confirmed_orders || 0}
                prefix={<Users className="text-orange-500" />}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="最近订单" extra={<Link to="/admin/orders">查看全部</Link>}>
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{order.order_no}</p>
                      <p className="text-sm text-gray-500">{order.hotel.name} - {order.room.name}</p>
                    </div>
                    <span className={`text-sm px-3 py-1 rounded-full ${
                      order.status === 'confirmed' ? 'bg-green-100 text-green-600' :
                      order.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {order.status === 'confirmed' ? '已确认' : 
                       order.status === 'pending' ? '待确认' : 
                       order.status === 'cancelled' ? '已取消' : '已完成'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="酒店列表" extra={<Link to="/admin/hotels">查看全部</Link>}>
              <div className="space-y-4">
                {recentHotels.map((hotel) => (
                  <div key={hotel.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{hotel.name}</p>
                      <p className="text-sm text-gray-500">{hotel.city} - {hotel.address}</p>
                    </div>
                    <span className="text-red-500 font-bold">¥{hotel.min_price}/晚</span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} className="mt-8">
          <Col xs={24} sm={6}>
            <Card className="cursor-pointer hover:shadow-md transition" onClick={() => window.location.href = '/admin/hotels/create'}>
              <div className="text-center py-4">
                <Hotel className="text-4xl text-blue-500 mx-auto mb-2" />
                <p className="font-medium">添加酒店</p>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card className="cursor-pointer hover:shadow-md transition" onClick={() => window.location.href = '/admin/hotels'}>
              <div className="text-center py-4">
                <ShoppingCart className="text-4xl text-green-500 mx-auto mb-2" />
                <p className="font-medium">酒店管理</p>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card className="cursor-pointer hover:shadow-md transition" onClick={() => window.location.href = '/admin/orders'}>
              <div className="text-center py-4">
                <Users className="text-4xl text-orange-500 mx-auto mb-2" />
                <p className="font-medium">订单管理</p>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card className="cursor-pointer hover:shadow-md transition" onClick={() => window.location.href = '/'}>
              <div className="text-center py-4">
                <DollarSign className="text-4xl text-purple-500 mx-auto mb-2" />
                <p className="font-medium">前台首页</p>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}

export default AdminDashboard;