import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['vueluc-app.web.app', 'vueluc-app.firebaseapp.com', 'vueluc-2.netlify.app', '.run.app']
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})