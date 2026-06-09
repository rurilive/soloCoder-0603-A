import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Button, message, Popconfirm } from 'antd';
import { Plus, Edit, Trash2 } from '@ant-design/icons';
import { hotelApi, roomApi } from '../../api';

function AdminRoomList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    hotelApi.getHotel(id).then((res) => {
      setHotel(res.data);
      setRooms(res.data.rooms || []);
    });
  }, [id]);

  const handleDelete = (roomId) => {
    roomApi.deleteRoom(roomId).then(() => {
      message.success('删除成功');
      setRooms(rooms.filter((r) => r.id !== roomId));
    }).catch(() => {
      message.error('删除失败');
    });
  };

  const columns = [
    {
      title: '房型名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '价格/晚',
      dataIndex: 'price_per_night',
      key: 'price_per_night',
      render: (price) => <span className="text-red-500 font-bold">¥{price}</span>,
    },
    {
      title: '床型',
      dataIndex: 'bed_type',
      key: 'bed_type',
      render: (type) => type === 'single' ? '单人床' : type === 'double' ? '双人床' : '双床',
    },
    {
      title: '入住人数',
      dataIndex: 'max_guests',
      key: 'max_guests',
      render: (num) => `${num}人`,
    },
    {
      title: '房间数量',
      dataIndex: 'room_count',
      key: 'room_count',
      render: (num) => `${num}间`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button type="link" onClick={() => navigate(`/admin/rooms/${record.id}/edit`)}>
            <Edit className="mr-1" />
            编辑
          </Button>
          <Popconfirm
            title="确定删除此房型？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger>
              <Trash2 className="mr-1" />
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  if (!hotel) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{hotel.name} - 房型管理</h2>
            <p className="text-gray-500">管理该酒店的房型信息</p>
          </div>
          <Button type="primary" onClick={() => navigate(`/admin/hotels/${id}/rooms/create`)}>
            <Plus className="mr-1" />
            添加房型
          </Button>
        </div>

        <Card>
          <Table
            dataSource={rooms}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            emptyText="暂无房型"
          />
        </Card>
      </div>
    </div>
  );
}

export default AdminRoomList;