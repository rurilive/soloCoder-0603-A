import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1112,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:1111',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:1111',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
