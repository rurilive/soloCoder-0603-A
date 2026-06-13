import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 1112,
    proxy: {
      '/api': {
        target: 'http://localhost:1111',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const exposeHeaders = proxyRes.headers['access-control-expose-headers'];
            if (!exposeHeaders) {
              proxyRes.headers['access-control-expose-headers'] = 'Content-Disposition, X-Suggested-Filename, content-disposition, x-suggested-filename';
            }
            const cd = proxyRes.headers['content-disposition'];
            if (cd) {
              proxyRes.headers['Content-Disposition'] = cd;
            }
            const sf = proxyRes.headers['x-suggested-filename'];
            if (sf) {
              proxyRes.headers['X-Suggested-Filename'] = sf;
            }
          });
        }
      }
    }
  }
})