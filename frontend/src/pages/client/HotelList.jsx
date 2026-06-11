import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Row, Col, Rate, Button, Select, Input, Slider } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { hotelApi } from '../../api';

const { Option } = Select;

function HotelList() {
  const [searchParams] = useSearchParams();
  const [hotels, setHotels] = useState([]);
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    city: searchParams.get('city') || '',
    star_rating: '',
    min_price: 0,
    max_price: 10000,
  });

  useEffect(() => {
    const params = {
      ...filters,
      star_rating: filters.star_rating ? parseInt(filters.star_rating) : undefined,
      min_price: filters.min_price,
      max_price: filters.max_price,
    };
    hotelApi.getHotels(params).then((res) => {
      setHotels(res.data);
    });
  }, [filters]);

  const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '西安'];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 w-full md:w-64">
            <h3 className="font-bold mb-4">筛选条件</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">搜索</label>
              <Input
                placeholder="酒店名称"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">城市</label>
              <Select
                placeholder="选择城市"
                value={filters.city}
                onChange={(value) => setFilters({ ...filters, city: value })}
              >
                <Option value="">全部城市</Option>
                {cities.map((city) => (
                  <Option key={city} value={city}>{city}</Option>
                ))}
              </Select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">星级</label>
              <Select
                placeholder="选择星级"
                value={filters.star_rating}
                onChange={(value) => setFilters({ ...filters, star_rating: value })}
              >
                <Option value="">全部星级</Option>
                <Option value="1">★ 1星及以上</Option>
                <Option value="2">★★ 2星及以上</Option>
                <Option value="3">★★★ 3星及以上</Option>
                <Option value="4">★★★★ 4星及以上</Option>
                <Option value="5">★★★★★ 5星</Option>
              </Select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                价格区间: ¥{filters.min_price} - ¥{filters.max_price}
              </label>
              <Slider
                range
                min={0}
                max={10000}
                defaultValue={[0, 10000]}
                onChange={([min, max]) => setFilters({ ...filters, min_price: min, max_price: max })}
              />
            </div>

            <Button
              type="primary"
              onClick={() => setFilters({ search: '', city: '', star_rating: '', min_price: 0, max_price: 10000 })}
            >
              重置筛选
            </Button>
          </div>

          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-6">搜索结果</h2>
            
            {hotels.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <p className="text-gray-500 text-lg">没有找到符合条件的酒店</p>
                <Button type="primary" className="mt-4" onClick={() => setFilters({ search: '', city: '', star_rating: '', min_price: 0, max_price: 10000 })}>
                  清除筛选条件
                </Button>
              </div>
            ) : (
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
                    >
                      <Card.Meta
                        title={hotel.name}
                        description={
                          <div>
                            <p className="flex items-center text-gray-500 text-sm mb-1">
                              <EnvironmentOutlined className="mr-1" />
                              {hotel.city} - {hotel.address}
                            </p>
                            <div className="flex items-center justify-between mb-2">
                              <Rate disabled defaultValue={hotel.star_rating} />
                              <span className="text-red-500 font-bold">
                                ¥{hotel.min_price}/晚起
                              </span>
                            </div>
                            <p className="text-gray-500 text-sm line-clamp-2">
                              {hotel.description}
                            </p>
                          </div>
                        }
                      />
                      <div className="mt-4">
                        <Link to={`/hotels/${hotel.id}`}>
                          <Button type="primary" block>查看详情</Button>
                        </Link>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HotelList;