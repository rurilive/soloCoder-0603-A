import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getMe } from '../api';

export default function PrivateRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((res) => {
        const user = res.data;
        if (user.role === 'agent' || user.role === 'admin') {
          localStorage.setItem('user', JSON.stringify(user));
          setValid(true);
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const token = localStorage.getItem('token');
  if (!token || !valid) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
