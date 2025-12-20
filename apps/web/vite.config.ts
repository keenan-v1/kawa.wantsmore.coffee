import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Get commit SHA from environment (set in CI/CD)
const COMMIT_SHA = process.env.COMMIT_SHA || 'dev'

export default defineConfig({
  plugins: [vue()],
  define: {
    // Inject build version into the app
    __APP_VERSION__: JSON.stringify(COMMIT_SHA),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true, // Better for WSL2
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['@kawakawa/types'],
  },
})
