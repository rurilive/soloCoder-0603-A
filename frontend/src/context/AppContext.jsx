import React, { createContext, useContext, useState, useEffect } from 'react'
import { publicApi } from '../services/api'

const AppContext = createContext()

export function AppProvider({ children }) {
  const [languages, setLanguages] = useState([])
  const [defaultLanguage, setDefaultLanguage] = useState('zh')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadLanguages()
  }, [])

  const loadLanguages = async () => {
    try {
      const res = await publicApi.getLanguages()
      setLanguages(res.data.supported_languages)
      setDefaultLanguage(res.data.default_language)
    } catch (e) {
      setLanguages(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'])
    }
  }

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

  return (
    <AppContext.Provider value={{
      languages,
      defaultLanguage,
      languageNames,
      toast,
      showToast,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
