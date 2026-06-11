import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Row, Col, Rate } from 'antd';
import { SearchOutlined, CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { hotelApi } from '../../api';

const popularCities = ['北京', '上海', '广州', '深圳', '杭州', '成都'];

function Home() {
  const [hotels, setHotels] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [city, setCity] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  useEffect(() => {
    hotelApi.getHotels({ limit: 6 }).then((res) => {
      setHotels(res.data);
    });
  }, []);

  const handleSearch = () => {
    let url = '/hotels';
    const params = [];
    if (searchText) params.push(`search=${encodeURIComponent(searchText)}`);
    if (city) params.push(`city=${encodeURIComponent(city)}`);
    if (params.length > 0) url += '?' + params.join('&');
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">发现您的理想酒店</h2>
          <p className="text-lg mb-8">全球优质酒店，一键预订</p>
          
          <div className="bg-white rounded-xl shadow-lg p-6 text-gray-800">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">目的地</label>
                <div className="flex items-center">
                  <SearchOutlined className="text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="城市、酒店名称"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">入住日期</label>
                <div className="flex items-center">
                  <CalendarOutlined className="text-gray-400 mr-2" />
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">退房日期</label>
                <div className="flex items-center">
                  <CalendarOutlined className="text-gray-400 mr-2" />
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex items-end">
                <Button 
                  type="primary" 
                  size="large" 
                  onClick={handleSearch}
                  className="w-full h-full"
                >
                  搜索酒店
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-2xl font-bold mb-6">热门城市</h3>
          <div className="flex flex-wrap gap-4">
            {popularCities.map((cityName) => (
              <Link
                key={cityName}
                to={`/hotels?city=${encodeURIComponent(cityName)}`}
                className="bg-white px-6 py-3 rounded-lg shadow hover:shadow-md transition cursor-pointer"
              >
                <EnvironmentOutlined className="inline-block mr-2 text-blue-500" />
                {cityName}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">推荐酒店</h3>
            <Link to="/hotels" className="text-blue-600 hover:text-blue-700">
              查看全部 →
            </Link>
          </div>
          
          <Row gutter={[16, 16]}>
            {hotels.map((hotel) => (
              <Col xs={24} sm={12} lg={8} key={hotel.id}>
                <Card
                  hoverable
                  cover={
                    <div className="h-48 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-4xl">🏨</span>
                    </div>
                  }
                  actions={[
                    <Link to={`/hotels/${hotel.id}`}>查看详情</Link>
                  ]}
                >
                  <Card.Meta
                    title={hotel.name}
                    description={
                      <div>
                        <p className="flex items-center text-gray-500 text-sm mb-1">
                          <EnvironmentOutlined className="mr-1" />
                          {hotel.city}
                        </p>
                        <div className="flex items-center justify-between">
                          <Rate disabled defaultValue={hotel.star_rating} />
                          <span className="text-red-500 font-bold">
                            ¥{hotel.min_price}/晚起
                          </span>
                        </div>
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-2xl font-bold mb-6">为什么选择我们</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <div className="text-4xl mb-4">✅</div>
                <h4 className="font-bold mb-2">安全可靠</h4>
                <p className="text-gray-500">安全支付，保障您的预订权益</p>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <div className="text-4xl mb-4">🏆</div>
                <h4 className="font-bold mb-2">优质服务</h4>
                <p className="text-gray-500">24小时客服，随时为您服务</p>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div className="text-center p-6 bg-white rounded-lg shadow">
                <div className="text-4xl mb-4">💰</div>
                <h4 className="font-bold mb-2">价格优惠</h4>
                <p className="text-gray-500">全网最低价，无隐藏费用</p>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      <footer className="bg-gray-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>© 2024 酒店预订系统. 保留所有权利.</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;