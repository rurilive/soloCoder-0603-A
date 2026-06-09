import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1112,
    proxy: {
      '/api': {
        target: 'http://localhost:1111',
        changeOrigin: true
      }
    }
  }
})