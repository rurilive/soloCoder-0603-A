import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usersApi, publicApi } from '../services/api'

const AppContext = createContext()

export function AppProvider({ children }) {
  const [languages, setLanguages] = useState([])
  const [defaultLanguage, setDefaultLanguage] = useState('zh')
  const [toast, setToast] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [userRoles, setUserRoles] = useState([])
  const [accessToken, setAccessToken] = useState(null)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const logoutRef = useRef(null)

  useEffect(() => {
    loadLanguages()
    restoreUser()
    const handleAuthLogout = () => {
      logoutRef.current?.()
    }
    window.addEventListener('auth:logout', handleAuthLogout)
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout)
    }
  }, [])

  const restoreUser = () => {
    try {
      const savedToken = localStorage.getItem('cms_access_token')
      const saved = localStorage.getItem('cms_current_user')
      const savedRoles = localStorage.getItem('cms_user_roles')
      if (savedToken) {
        setAccessToken(savedToken)
      }
      if (saved) {
        setCurrentUser(JSON.parse(saved))
      }
      if (savedRoles) {
        setUserRoles(JSON.parse(savedRoles))
      }
      if (!savedToken || !saved) {
        setIsLoginModalOpen(true)
      }
    } catch (e) {
      console.error('Restore user error:', e)
    }
  }

  const loadLanguages = async () => {
    try {
      const res = await publicApi.getLanguages()
      setLanguages(res.data.supported_languages)
      setDefaultLanguage(res.data.default_language)
    } catch (e) {
      setLanguages(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'])
    }
  }

  const login = useCallback(async (username, password) => {
    setIsLoading(true)
    try {
      const res = await usersApi.login(username, password)
      const { access_token: token, user, roles } = res.data
      setAccessToken(token)
      setCurrentUser(user)
      setUserRoles(roles)
      localStorage.setItem('cms_access_token', token)
      localStorage.setItem('cms_current_user', JSON.stringify(user))
      localStorage.setItem('cms_user_roles', JSON.stringify(roles))
      setIsLoginModalOpen(false)
      showToast(`欢迎回来，${user.full_name || user.username}！`, 'success')
      return true
    } catch (e) {
      const msg = e.response?.data?.detail || '登录失败'
      showToast(msg, 'error')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setAccessToken(null)
    setCurrentUser(null)
    setUserRoles([])
    localStorage.removeItem('cms_access_token')
    localStorage.removeItem('cms_current_user')
    localStorage.removeItem('cms_user_roles')
    setIsLoginModalOpen(true)
    showToast('已退出登录', 'info')
  }, [])

  logoutRef.current = logout

  const hasRole = useCallback((...roles) => {
    return roles.some(r => userRoles.includes(r))
  }, [userRoles])

  const hasPermission = useCallback((...codenames) => {
    if (!currentUser?.permissions) return hasRole('admin')
    return currentUser.permissions.some(p => codenames.includes(p.codename)) || hasRole('admin')
  }, [currentUser, hasRole])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const languageNames = {
    zh: '中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
  }

  const openLogin = () => setIsLoginModalOpen(true)
  const closeLogin = () => setIsLoginModalOpen(false)

  return (
    <AppContext.Provider value={{
      languages,
      defaultLanguage,
      languageNames,
      toast,
      showToast,
      currentUser,
      userRoles,
      accessToken,
      isLoginModalOpen,
      isLoading,
      login,
      logout,
      hasRole,
      hasPermission,
      openLogin,
      closeLogin,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
