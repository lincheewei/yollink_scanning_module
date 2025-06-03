import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all interfaces (0.0.0.0)
    port: 5173,
    allowedHosts: [
      'localhost',
      'ec2-43-216-11-51.ap-southeast-5.compute.amazonaws.com'
    ],
    proxy: {
      '/api': 'http://localhost:9090'
    }
  }
})