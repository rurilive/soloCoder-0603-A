import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import DocumentList from './pages/DocumentList.jsx'
import DocumentUpload from './pages/DocumentUpload.jsx'
import DocumentPreview from './pages/DocumentPreview.jsx'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('user')
    if (saved) setUser(JSON.parse(saved))
  }, [location.pathname])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  if (location.pathname === '/login' || location.pathname === '/register') {
    return null
  }

  return (
    <nav className="navbar">
      <h1>📄 文档在线预览服务</h1>
      <div className="nav-links">
        <Link to="/documents">文档列表</Link>
        <Link to="/upload">上传文档</Link>
        {user && <span>👤 {user.full_name || user.username}</span>}
        <button onClick={handleLogout}>退出</button>
      </div>
    </nav>
  )
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <div className="app-container">
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/documents"
          element={
            <PrivateRoute>
              <DocumentList />
            </PrivateRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <PrivateRoute>
              <DocumentUpload />
            </PrivateRoute>
          }
        />
        <Route
          path="/preview/:id"
          element={
            <PrivateRoute>
              <DocumentPreview />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/documents" />} />
        <Route path="*" element={<Navigate to="/documents" />} />
      </Routes>
    </div>
  )
}
