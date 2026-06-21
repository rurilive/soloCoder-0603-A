import React, { useState } from 'react'
import Modal from './Modal.jsx'
import { useApp } from '../context/AppContext.jsx'

export default function LoginModal() {
  const { isLoginModalOpen, closeLogin, login, isLoading } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) return
    await login(username, password)
  }

  const quickLogin = async (u, p) => {
    setUsername(u)
    setPassword(p)
    await login(u, p)
  }

  const quickAccounts = [
    { label: '管理员', user: 'admin', pass: 'admin123' },
    { label: '编辑', user: 'editor', pass: 'editor123' },
    { label: '英文翻译', user: 'translator_en', pass: 'trans123' },
    { label: '日文翻译', user: 'translator_ja', pass: 'trans123' },
    { label: '审校', user: 'reviewer', pass: 'review123' },
  ]

  return (
    <Modal
      open={isLoginModalOpen}
      onClose={() => {}}
      title="登录多语言CMS"
      footer={null}
    >
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入用户名"
            className="form-input"
            required
          />
        </div>
        <div className="form-group">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="form-input"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
          {isLoading ? '登录中...' : '登 录'}
        </button>

        <div className="quick-login">
          <div className="quick-login-title">快捷登录（测试账号）：</div>
          <div className="quick-login-buttons">
            {quickAccounts.map((acc) => (
              <button
                key={acc.user}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => quickLogin(acc.user, acc.pass)}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
