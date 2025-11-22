import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      // use explicit IPv4 loopback to avoid tooling resolving to ::1
      '/api': 'http://127.0.0.1:3030'
    }
  }
})
