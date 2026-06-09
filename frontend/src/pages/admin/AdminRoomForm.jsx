import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Button, message, Select } from 'antd';
import { roomApi } from '../../api';

const { TextArea } = Input;
const { Option } = Select;

function AdminRoomForm() {
  const { hotelId, id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      roomApi.getRoom(id).then((res) => {
        form.setFieldsValue(res.data);
      }).catch(() => {
        console.log('Room not found, creating new');
      });
    }
  }, [id, form]);

  const handleSubmit = (values) => {
    if (isEdit) {
      roomApi.updateRoom(id, values).then(() => {
        message.success('更新成功');
        navigate(`/admin/hotels/${hotelId}/rooms`);
      }).catch(() => {
        message.error('更新失败');
      });
    } else {
      roomApi.createRoom(hotelId, values).then(() => {
        message.success('创建成功');
        navigate(`/admin/hotels/${hotelId}/rooms`);
      }).catch(() => {
        message.error('创建失败');
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card title={isEdit ? '编辑房型' : '添加房型'}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="name"
              label="房型名称"
              rules={[{ required: true, message: '请输入房型名称' }]}
            >
              <Input placeholder="如：豪华大床房" />
            </Form.Item>

            <Form.Item
              name="description"
              label="描述"
            >
              <TextArea rows={3} placeholder="房型描述" />
            </Form.Item>

            <Form.Item
              name="price_per_night"
              label="每晚价格"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              <InputNumber 
                className="w-full" 
                placeholder="每晚价格" 
                prefix="¥"
                min={0}
              />
            </Form.Item>

            <Form.Item
              name="bed_type"
              label="床型"
              rules={[{ required: true, message: '请选择床型' }]}
            >
              <Select placeholder="选择床型">
                <Option value="single">单人床</Option>
                <Option value="double">双人床</Option>
                <Option value="twin">双床</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="max_guests"
              label="最大入住人数"
              rules={[{ required: true, message: '请输入人数' }]}
            >
              <InputNumber className="w-full" placeholder="最大入住人数" min={1} />
            </Form.Item>

            <Form.Item
              name="room_count"
              label="房间数量"
              rules={[{ required: true, message: '请输入房间数量' }]}
            >
              <InputNumber className="w-full" placeholder="房间数量" min={1} />
            </Form.Item>

            <Form.Item>
              <div className="flex gap-4">
                <Button type="primary" htmlType="submit" className="flex-1">
                  {isEdit ? '更新房型' : '创建房型'}
                </Button>
                <Button onClick={() => navigate(`/admin/hotels/${hotelId}/rooms`)}>取消</Button>
              </div>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}

export default AdminRoomForm;