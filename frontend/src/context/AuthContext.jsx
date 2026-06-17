import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, authEventBus } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('current_user');
    if (token && userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        handleLogout();
      }
    } else {
      setLoginModalVisible(true);
    }
  }, []);

  useEffect(() => {
    const unsub = authEventBus.onAuthRequired(() => {
      setCurrentUser(null);
      setLoginModalVisible(true);
    });
    return unsub;
  }, []);

  const handleLogin = useCallback(async (values) => {
    setLoginLoading(true);
    try {
      const res = await authAPI.login(values);
      const { access_token, user } = res.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('current_user', JSON.stringify(user));
      setCurrentUser(user);
      setLoginModalVisible(false);
      return { success: true, user };
    } catch (err) {
      const msg = err.response?.data?.detail || '登录失败';
      return { success: false, message: msg };
    } finally {
      setLoginLoading(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    setCurrentUser(null);
    setLoginModalVisible(true);
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAdmin,
      loginModalVisible,
      setLoginModalVisible,
      loginLoading,
      handleLogin,
      handleLogout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export default AuthContext;
