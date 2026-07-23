import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev proxy: the frontend's API client (src/api/chunks.ts) calls same-origin
    // `/api/chunks/...`, but in dev Vite serves on :5173 while the Spring Boot
    // backend is on :8080. This makes Vite transparently forward `/api` to the
    // backend so the browser never hits cross-origin (no CORS config needed on
    // the Java side). Prod deploys should reverse-proxy the same path instead.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})