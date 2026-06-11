import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Form, InputNumber, DatePicker, Table, Modal, message, Popconfirm, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PercentageOutlined } from '@ant-design/icons';
import { stayDiscountApi, roomApi, hotelApi } from '../../api';

function AdminStayDiscount() {
  const { hotelId, roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();

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
    loadDiscounts();
  }, [roomId, hotelId]);

  const loadDiscounts = () => {
    stayDiscountApi.getStayDiscountsByRoom(roomId).then((res) => {
      setDiscounts(res.data);
    });
  };

  const showModal = (item = null) => {
    setEditingItem(item);
    if (item) {
      form.setFieldsValue({
        min_nights: item.min_nights,
        discount_percent: item.discount_percent,
        start_date: item.start_date,
        end_date: item.end_date,
        is_active: item.is_active === 1,
      });
    } else {
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleSubmit = (values) => {
    const data = {
      room_id: parseInt(roomId),
      min_nights: values.min_nights,
      discount_percent: values.discount_percent,
      start_date: values.start_date.format('YYYY-MM-DD'),
      end_date: values.end_date.format('YYYY-MM-DD'),
      is_active: values.is_active ? 1 : 0,
    };

    if (editingItem) {
      stayDiscountApi.updateStayDiscount(editingItem.id, data).then(() => {
        message.success('更新成功');
        setIsModalVisible(false);
        loadDiscounts();
      }).catch(() => {
        message.error('更新失败');
      });
    } else {
      stayDiscountApi.createStayDiscount(data).then(() => {
        message.success('创建成功');
        setIsModalVisible(false);
        loadDiscounts();
      }).catch(() => {
        message.error('创建失败');
      });
    }
  };

  const handleDelete = (id) => {
    stayDiscountApi.deleteStayDiscount(id).then(() => {
      message.success('删除成功');
      loadDiscounts();
    }).catch(() => {
      message.error('删除失败');
    });
  };

  const handleToggleStatus = (record) => {
    const newStatus = record.is_active === 1 ? 0 : 1;
    stayDiscountApi.updateStayDiscount(record.id, { is_active: newStatus }).then(() => {
      message.success('状态更新成功');
      loadDiscounts();
    }).catch(() => {
      message.error('状态更新失败');
    });
  };

  const columns = [
    {
      title: '最低连住天数',
      dataIndex: 'min_nights',
      key: 'min_nights',
      render: (nights) => `${nights} 晚`,
    },
    {
      title: '优惠折扣',
      dataIndex: 'discount_percent',
      key: 'discount_percent',
      render: (percent) => (
        <span className="text-red-500 font-bold">
          -{percent}%
        </span>
      ),
    },
    {
      title: '有效期',
      key: 'period',
      render: (_, record) => `${record.start_date} ~ ${record.end_date}`,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <span className={active === 1 ? 'text-green-500' : 'text-gray-400'}>
          {active === 1 ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <div className="flex gap-2">
          <Switch
            checked={record.is_active === 1}
            onChange={() => handleToggleStatus(record)}
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => showModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该优惠规则？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
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
            <h1 className="text-2xl font-bold">连住优惠配置</h1>
            {hotel && room && (
              <p className="text-gray-500 mt-1">
                {hotel.name} - {room.name}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={showModal}
            >
              添加优惠规则
            </Button>
            <Button onClick={() => navigate(`/admin/hotels/${hotelId}/rooms`)}>
              返回房型列表
            </Button>
          </div>
        </div>

        <Card>
          <Table
            dataSource={discounts}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            title={() => `已配置 ${discounts.length} 条优惠规则`}
          />
        </Card>

        <Modal
          title={editingItem ? '编辑优惠规则' : '添加优惠规则'}
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
              name="min_nights"
              label="最低连住天数"
              rules={[{ required: true, message: '请输入最低连住天数' }]}
            >
              <InputNumber className="w-full" placeholder="如：3" min={2} />
            </Form.Item>

            <Form.Item
              name="discount_percent"
              label="优惠折扣 (%)"
              rules={[{ required: true, message: '请输入折扣百分比' }]}
            >
              <InputNumber className="w-full" prefix={<PercentageOutlined />} min={1} max={99} />
            </Form.Item>

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

            <Form.Item name="is_active" label="启用状态">
              <Switch defaultChecked />
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
      </div>
    </div>
  );
}

export default AdminStayDiscount;