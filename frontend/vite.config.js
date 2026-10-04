import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api is proxied to the backend so the app and API share one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_BACKEND_URL || 'http://localhost:5000', changeOrigin: true },
    },
  },
})
