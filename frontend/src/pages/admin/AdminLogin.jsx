import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message } from 'antd';

function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = (values) => {
    setLoading(true);
    
    setTimeout(() => {
      if (values.username === 'admin' && values.password === 'admin') {
        message.success('登录成功');
        navigate('/admin/dashboard');
      } else {
        message.error('用户名或密码错误');
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6">管理后台登录</h2>
        <Form layout="vertical" onFinish={handleLogin}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>

          <p className="text-center text-gray-500 text-sm mt-4">
            默认账号: admin / admin
          </p>
        </Form>
      </Card>
    </div>
  );
}

export default AdminLogin;