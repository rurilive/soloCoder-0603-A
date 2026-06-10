import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Form, InputNumber, DatePicker, Table, Modal, message, Popconfirm } from 'antd';
import { Plus, Edit, Delete, Calendar } from '@ant-design/icons';
import { priceCalendarApi, roomApi, hotelApi } from '../../api';

function AdminPriceCalendar() {
  const { hotelId, roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isBatchModalVisible, setIsBatchModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();

  useEffect(() => {
    if (roomId) {
      roomApi.getRoom(roomId).then((res) => {
        setRoom(res.data);
      });
    }
    if (hotelId) {
      hotelApi.getHotel(hotelId).then((res) => {
        setHotel(res.data);
      });
    }
    loadCalendars();
  }, [roomId, hotelId]);

  const loadCalendars = () => {
    priceCalendarApi.getPriceCalendarsByRoom(roomId).then((res) => {
      setCalendars(res.data);
    });
  };

  const showModal = (item = null) => {
    setEditingItem(item);
    if (item) {
      form.setFieldsValue({
        date: item.date,
        price: item.price,
      });
    } else {
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const showBatchModal = () => {
    batchForm.resetFields();
    setIsBatchModalVisible(true);
  };

  const handleSubmit = (values) => {
    const data = {
      room_id: parseInt(roomId),
      date: values.date.format('YYYY-MM-DD'),
      price: values.price,
    };

    if (editingItem) {
      priceCalendarApi.updatePriceCalendar(editingItem.id, { price: values.price }).then(() => {
        message.success('更新成功');
        setIsModalVisible(false);
        loadCalendars();
      }).catch(() => {
        message.error('更新失败');
      });
    } else {
      priceCalendarApi.createPriceCalendar(data).then(() => {
        message.success('创建成功');
        setIsModalVisible(false);
        loadCalendars();
      }).catch(() => {
        message.error('创建失败，该日期价格已存在');
      });
    }
  };

  const handleBatchSubmit = (values) => {
    const data = {
      room_id: parseInt(roomId),
      start_date: values.start_date.format('YYYY-MM-DD'),
      end_date: values.end_date.format('YYYY-MM-DD'),
      price: values.price,
    };

    priceCalendarApi.batchCreatePriceCalendar(data).then(() => {
      message.success('批量创建成功');
      setIsBatchModalVisible(false);
      loadCalendars();
    }).catch(() => {
      message.error('批量创建失败');
    });
  };

  const handleDelete = (id) => {
    priceCalendarApi.deletePriceCalendar(id).then(() => {
      message.success('删除成功');
      loadCalendars();
    }).catch(() => {
      message.error('删除失败');
    });
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: '价格 (¥)',
      dataIndex: 'price',
      key: 'price',
      render: (price) => `¥${price}`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button
            type="text"
            icon={<Edit />}
            onClick={() => showModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该价格设置？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" danger icon={<Delete />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">价格日历配置</h1>
            {hotel && room && (
              <p className="text-gray-500 mt-1">
                {hotel.name} - {room.name}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="primary"
              icon={<Plus />}
              onClick={showModal}
            >
              添加单天价格
            </Button>
            <Button
              icon={<Calendar />}
              onClick={showBatchModal}
            >
              批量设置日期
            </Button>
            <Button onClick={() => navigate(`/admin/hotels/${hotelId}/rooms`)}>
              返回房型列表
            </Button>
          </div>
        </div>

        <Card>
          <Table
            dataSource={calendars}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            title={() => `已配置 ${calendars.length} 天价格`}
          />
        </Card>

        <Modal
          title={editingItem ? '编辑价格' : '添加价格'}
          visible={isModalVisible}
          footer={null}
          onCancel={() => setIsModalVisible(false)}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="date"
              label="日期"
              rules={[{ required: true, message: '请选择日期' }]}
            >
              <DatePicker className="w-full" />
            </Form.Item>

            <Form.Item
              name="price"
              label="价格"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              <InputNumber className="w-full" prefix="¥" min={0} />
            </Form.Item>

            <Form.Item>
              <div className="flex gap-4">
                <Button type="primary" htmlType="submit" className="flex-1">
                  {editingItem ? '更新' : '创建'}
                </Button>
                <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              </div>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="批量设置价格"
          visible={isBatchModalVisible}
          footer={null}
          onCancel={() => setIsBatchModalVisible(false)}
        >
          <Form
            form={batchForm}
            layout="vertical"
            onFinish={handleBatchSubmit}
          >
            <Form.Item
              name="start_date"
              label="开始日期"
              rules={[{ required: true, message: '请选择开始日期' }]}
            >
              <DatePicker className="w-full" />
            </Form.Item>

            <Form.Item
              name="end_date"
              label="结束日期"
              rules={[{ required: true, message: '请选择结束日期' }]}
            >
              <DatePicker className="w-full" />
            </Form.Item>

            <Form.Item
              name="price"
              label="价格"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              <InputNumber className="w-full" prefix="¥" min={0} />
            </Form.Item>

            <Form.Item>
              <div className="flex gap-4">
                <Button type="primary" htmlType="submit" className="flex-1">
                  批量创建
                </Button>
                <Button onClick={() => setIsBatchModalVisible(false)}>取消</Button>
              </div>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

export default AdminPriceCalendar;