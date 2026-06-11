import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Table, Button, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CarOutlined } from '@ant-design/icons';
import { hotelApi } from '../../api';

function AdminHotelList() {
  const [hotels, setHotels] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    hotelApi.getHotels().then((res) => {
      setHotels(res.data);
    });
  }, []);

  const handleDelete = (id) => {
    hotelApi.deleteHotel(id).then(() => {
      message.success('删除成功');
      setHotels(hotels.filter((h) => h.id !== id));
    }).catch(() => {
      message.error('删除失败');
    });
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
    },
    {
      title: '星级',
      dataIndex: 'star_rating',
      key: 'star_rating',
      render: (rating) => '★'.repeat(rating),
    },
    {
      title: '房型数量',
      dataIndex: 'rooms',
      key: 'rooms',
      render: (rooms) => rooms?.length || 0,
    },
    {
      title: '最低价格',
      dataIndex: 'min_price',
      key: 'min_price',
      render: (price) => <span className="text-red-500 font-bold">¥{price}/晚</span>,
    },
    {
      title: '设施',
      dataIndex: 'amenities',
      key: 'amenities',
      render: (amenities) => (
        <div className="flex flex-wrap gap-1">
          {amenities?.map((amenity) => (
            <Tag key={amenity}>{amenity}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button type="link" onClick={() => navigate(`/admin/hotels/${record.id}/rooms`)}>
            <CarOutlined className="mr-1" />
            房型管理
          </Button>
          <Button type="link" onClick={() => navigate(`/admin/hotels/${record.id}/edit`)}>
            <EditOutlined className="mr-1" />
            编辑
          </Button>
          <Popconfirm
            title="确定删除此酒店？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger>
              <DeleteOutlined className="mr-1" />
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">酒店管理</h2>
          <Button type="primary" onClick={() => navigate('/admin/hotels/create')}>
            <PlusOutlined className="mr-1" />
            添加酒店
          </Button>
        </div>

        <Card>
          <Table
            dataSource={hotels}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            emptyText="暂无酒店"
          />
        </Card>
      </div>
    </div>
  );
}

export default AdminHotelList;