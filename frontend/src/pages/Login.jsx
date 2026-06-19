import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authAPI } from '../api.js'

export default function Login() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.login(formData.username, formData.password)
      localStorage.setItem('token', res.data.access_token)
      const meRes = await authAPI.getMe()
      localStorage.setItem('user', JSON.stringify(meRes.data))
      navigate('/documents')
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <h2>登录</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>用户名</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>密码</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
      <div className="auth-link">
        还没有账号？<Link to="/register">立即注册</Link>
      </div>
      <div className="auth-link" style={{ marginTop: 12, fontSize: 12, color: '#80868b' }}>
        演示账号: admin / admin123 或 demo / demo123
      </div>
    </div>
  )
}
