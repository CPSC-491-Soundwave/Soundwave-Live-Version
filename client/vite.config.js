import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backendTarget =
  process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})