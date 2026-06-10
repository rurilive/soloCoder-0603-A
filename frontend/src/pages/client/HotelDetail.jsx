import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Rate, Modal, Form, Input, DatePicker, message } from 'antd';
import { MapPin, Wifi, Coffee, Pool, Car, Bed, Calendar, Percent } from '@ant-design/icons';
import { hotelApi, bookingApi, pricingApi } from '../../api';

function HotelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [priceInfo, setPriceInfo] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    hotelApi.getHotel(id).then((res) => {
      setHotel(res.data);
    });
  }, [id]);

  const showBookingModal = (room) => {
    setSelectedRoom(room);
    setIsBookingModalVisible(true);
    setPriceInfo(null);
    form.resetFields();
  };

  const handleDateChange = (changedValues, allValues) => {
    if (changedValues.check_in || changedValues.check_out) {
      if (selectedRoom && allValues.check_in && allValues.check_out) {
        calculatePrice(allValues.check_in, allValues.check_out);
      }
    }
  };

  const calculatePrice = (checkIn, checkOut) => {
    if (!selectedRoom || !checkIn || !checkOut) return;
    
    setIsCalculating(true);
    pricingApi.calculatePrice({
      room_id: selectedRoom.id,
      check_in: checkIn.format('YYYY-MM-DD'),
      check_out: checkOut.format('YYYY-MM-DD'),
    }).then((res) => {
      setPriceInfo(res.data);
      setIsCalculating(false);
    }).catch(() => {
      message.error('价格计算失败');
      setIsCalculating(false);
    });
  };

  const handleBooking = (values) => {
    if (!priceInfo) {
      message.error('请先选择日期并计算价格');
      return;
    }

    const bookingData = {
      room_id: selectedRoom.id,
      guest_name: values.guest_name,
      guest_phone: values.guest_phone,
      guest_email: values.guest_email,
      check_in: values.check_in.format('YYYY-MM-DD'),
      check_out: values.check_out.format('YYYY-MM-DD'),
      special_requests: values.special_requests,
    };

    bookingApi.createBooking(bookingData).then((res) => {
      message.success('预订成功！');
      setIsBookingModalVisible(false);
      navigate(`/booking-success/${res.data.id}`);
    }).catch((error) => {
      message.error(error.response?.data?.detail || '预订失败，请重试');
    });
  };

  const getAmenityIcon = (amenity) => {
    const icons = {
      wifi: <Wifi className="text-blue-500" />,
      pool: <Pool className="text-blue-500" />,
      parking: <Car className="text-blue-500" />,
      breakfast: <Coffee className="text-blue-500" />,
    };
    return icons[amenity] || null;
  };

  if (!hotel) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="h-64 bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center">
            <span className="text-white text-6xl">🏨</span>
          </div>
          <div className="p-8">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">{hotel.name}</h1>
                <div className="flex items-center gap-4">
                  <Rate disabled defaultValue={hotel.star_rating} />
                  <span className="text-gray-500">{hotel.star_rating}星级酒店</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-red-500 text-2xl font-bold">¥{hotel.min_price} <span className="text-lg font-normal">/晚起</span></p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center text-gray-500">
              <MapPin className="mr-2" />
              {hotel.city} - {hotel.address}
            </div>

            <div className="mt-4">
              <p className="text-gray-600">{hotel.description}</p>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              {hotel.amenities?.map((amenity) => (
                <span key={amenity} className="flex items-center px-4 py-2 bg-gray-100 rounded-full">
                  {getAmenityIcon(amenity)}
                  <span className="ml-2">{amenity === 'wifi' ? '免费WiFi' : amenity === 'pool' ? '游泳池' : amenity === 'parking' ? '停车场' : amenity === 'breakfast' ? '早餐' : amenity}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-6">房型选择</h2>
        <Row gutter={[16, 16]}>
          {hotel.rooms?.map((room) => (
            <Col xs={24} lg={12} key={room.id}>
              <Card
                hoverable
                className={selectedRoom?.id === room.id ? 'ring-2 ring-blue-500' : ''}
              >
                <div className="flex items-start">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-300 to-blue-500 rounded-lg flex items-center justify-center mr-4">
                    <Bed className="text-white text-3xl" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{room.name}</h3>
                    <p className="text-gray-500 text-sm mb-2">{room.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span>床型: {room.bed_type === 'single' ? '单人床' : room.bed_type === 'double' ? '双人床' : '双床'}</span>
                      <span>入住人数: {room.max_guests}人</span>
                      <span>剩余: {room.room_count}间</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-red-500 text-xl font-bold">¥{room.price_per_night}/晚</span>
                      <Button
                        type="primary"
                        onClick={() => showBookingModal(room)}
                      >
                        立即预订
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Modal
        title="预订确认"
        visible={isBookingModalVisible}
        footer={null}
        onCancel={() => setIsBookingModalVisible(false)}
        width={600}
      >
        {selectedRoom && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-bold">{hotel.name}</h4>
            <p className="text-gray-500">{selectedRoom.name}</p>
            <p className="text-red-500 font-bold mt-2">¥{selectedRoom.price_per_night}/晚</p>
          </div>
        )}
        
        {priceInfo && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">入住日期:</span>
              <span className="font-bold">{priceInfo.check_in} ~ {priceInfo.check_out}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">入住天数:</span>
              <span className="font-bold">{priceInfo.nights} 晚</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">原价:</span>
              <span className="line-through text-gray-400">¥{priceInfo.original_total}</span>
            </div>
            {priceInfo.discount && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">
                  <Percent className="inline mr-1" />
                  连住优惠 ({priceInfo.discount_percent}%):
                </span>
                <span className="text-green-600 font-bold">-¥{priceInfo.discount}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-green-200">
              <span className="text-lg font-bold">实付金额:</span>
              <span className="text-red-500 text-2xl font-bold">¥{priceInfo.final_total}</span>
            </div>
          </div>
        )}
        
        <Form
          form={form}
          layout="vertical"
          onFinish={handleBooking}
          onValuesChange={handleDateChange}
        >
          <Form.Item
            name="guest_name"
            label="入住人姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            name="guest_phone"
            label="联系电话"
            rules={[{ required: true, message: '请输入电话' }]}
          >
            <Input placeholder="请输入电话号码" />
          </Form.Item>

          <Form.Item
            name="guest_email"
            label="邮箱"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            name="check_in"
            label="入住日期"
            rules={[{ required: true, message: '请选择入住日期' }]}
          >
            <DatePicker className="w-full" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="check_out"
            label="退房日期"
            rules={[{ required: true, message: '请选择退房日期' }]}
          >
            <DatePicker className="w-full" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="special_requests" label="特殊要求">
            <Input.TextArea placeholder="如有特殊要求，请在此说明" />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block
              loading={isCalculating}
            >
              {isCalculating ? '计算价格中...' : '确认预订'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default HotelDetail;