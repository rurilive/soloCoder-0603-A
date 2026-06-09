import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Button, message, Select } from 'antd';
import { hotelApi } from '../../api';

const { TextArea } = Input;
const { Option } = Select;

function AdminHotelForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      hotelApi.getHotel(id).then((res) => {
        form.setFieldsValue({
          ...res.data,
          amenities: res.data.amenities?.join(',') || '',
        });
      });
    }
  }, [id, form]);

  const handleSubmit = (values) => {
    const data = {
      ...values,
      amenities: values.amenities.split(',').map((a) => a.trim()).filter(Boolean),
    };

    if (isEdit) {
      hotelApi.updateHotel(id, data).then(() => {
        message.success('更新成功');
        navigate('/admin/hotels');
      }).catch(() => {
        message.error('更新失败');
      });
    } else {
      hotelApi.createHotel(data).then(() => {
        message.success('创建成功');
        navigate('/admin/hotels');
      }).catch(() => {
        message.error('创建失败');
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card title={isEdit ? '编辑酒店' : '添加酒店'}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="name"
              label="酒店名称"
              rules={[{ required: true, message: '请输入酒店名称' }]}
            >
              <Input placeholder="请输入酒店名称" />
            </Form.Item>

            <Form.Item
              name="city"
              label="城市"
              rules={[{ required: true, message: '请输入城市' }]}
            >
              <Select placeholder="选择城市">
                <Option value="北京">北京</Option>
                <Option value="上海">上海</Option>
                <Option value="广州">广州</Option>
                <Option value="深圳">深圳</Option>
                <Option value="杭州">杭州</Option>
                <Option value="成都">成都</Option>
                <Option value="南京">南京</Option>
                <Option value="西安">西安</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="address"
              label="地址"
              rules={[{ required: true, message: '请输入地址' }]}
            >
              <Input placeholder="请输入详细地址" />
            </Form.Item>

            <Form.Item
              name="description"
              label="描述"
            >
              <TextArea rows={4} placeholder="请输入酒店描述" />
            </Form.Item>

            <Form.Item
              name="star_rating"
              label="星级"
              rules={[{ required: true, message: '请选择星级' }]}
            >
              <Select placeholder="选择星级">
                <Option value="1">★ 1星</Option>
                <Option value="2">★★ 2星</Option>
                <Option value="3">★★★ 3星</Option>
                <Option value="4">★★★★ 4星</Option>
                <Option value="5">★★★★★ 5星</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="amenities"
              label="设施"
            >
              <Input placeholder="多个设施用逗号分隔，如: wifi,pool,parking,breakfast" />
            </Form.Item>

            <Form.Item>
              <div className="flex gap-4">
                <Button type="primary" htmlType="submit" className="flex-1">
                  {isEdit ? '更新酒店' : '创建酒店'}
                </Button>
                <Button onClick={() => navigate('/admin/hotels')}>取消</Button>
              </div>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}

export default AdminHotelForm;